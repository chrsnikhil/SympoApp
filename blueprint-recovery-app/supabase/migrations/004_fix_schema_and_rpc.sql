-- =============================================================================
-- Blueprint Recovery — Migration 004: Strict Status Names & Secure RLS Policies
-- =============================================================================

-- 1. Canonical Status Check Constraint
-- Exactly 5 status values: 'not_started', 'in_progress', 'awaiting_reveal', 'checkpoint_a_done', 'complete'
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check
  CHECK (status IN (
    'not_started',
    'in_progress',
    'awaiting_reveal',
    'checkpoint_a_done',
    'complete'
  ));

-- Ensure timestamp & counter columns exist safely
ALTER TABLE teams ADD COLUMN IF NOT EXISTS checkpoint_a_time timestamptz;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wrong_attempts_a integer DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wrong_attempts_b integer DEFAULT 0;

-- 2. Secure RLS Policies on `teams` table
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "teams can update own row" ON teams;
DROP POLICY IF EXISTS "teams can insert own row" ON teams;
DROP POLICY IF EXISTS "public read teams" ON teams;
DROP POLICY IF EXISTS "public_read_teams" ON teams;
DROP POLICY IF EXISTS "anon_insert_in_progress_only" ON teams;
DROP POLICY IF EXISTS "anon_update_awaiting_reveal_only" ON teams;
DROP POLICY IF EXISTS "anon_update_allowed_transitions" ON teams;

-- Public read access for teams table (anon needs to read own status & dashboard needs to view table)
CREATE POLICY "public_read_teams"
  ON teams FOR SELECT
  TO anon, authenticated
  USING (true);

-- Strict INSERT policy: anon can only insert a team with initial status = 'in_progress'
CREATE POLICY "anon_insert_in_progress_only"
  ON teams FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'in_progress');

-- Strict UPDATE policy: anon can ONLY transition:
-- 1. 'not_started' -> 'in_progress' (re-entry after coordinator reset)
-- 2. 'in_progress' -> 'awaiting_reveal' (Evidence Secured notify)
CREATE POLICY "anon_update_allowed_transitions"
  ON teams FOR UPDATE
  TO anon, authenticated
  USING (status IN ('not_started', 'in_progress'))
  WITH CHECK (
    (status = 'in_progress') OR
    (status = 'awaiting_reveal')
  );

-- 3. get_revealed_location RPC Function
CREATE OR REPLACE FUNCTION get_revealed_location(p_team_number int)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_location text;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM teams WHERE team_number = p_team_number;
  IF v_status NOT IN ('checkpoint_a_done', 'complete') THEN
    RETURN null; -- not revealed yet, don't leak it early
  END IF;

  SELECT v.correct_location INTO v_location
  FROM teams t JOIN variants v ON t.variant_number = v.variant_number
  WHERE t.team_number = p_team_number;

  RETURN v_location;
END;
$$;

GRANT EXECUTE ON FUNCTION get_revealed_location(int) TO anon;
GRANT EXECUTE ON FUNCTION get_revealed_location(int) TO authenticated;
GRANT EXECUTE ON FUNCTION get_revealed_location(int) TO service_role;

-- 4. Update validate_checkpoint RPC to check status = 'checkpoint_a_done'
CREATE OR REPLACE FUNCTION validate_checkpoint(
  p_team_number integer,
  p_checkpoint text,
  p_submitted_value text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team RECORD;
  v_correct_value text;
  v_is_correct boolean;
BEGIN
  SELECT variant_number, status
  INTO v_team
  FROM teams
  WHERE team_number = p_team_number;

  IF v_team IS NULL THEN
    RETURN json_build_object('correct', false, 'error', 'Team not found');
  END IF;

  IF v_team.status = 'complete' THEN
    RETURN json_build_object('correct', false, 'error', 'Team has already completed the mission');
  END IF;

  IF p_checkpoint <> 'B' THEN
    RETURN json_build_object('correct', false, 'error', 'Invalid checkpoint');
  END IF;

  -- Checkpoint B requires status = 'checkpoint_a_done'
  IF v_team.status <> 'checkpoint_a_done' THEN
    RETURN json_build_object('correct', false, 'error', 'Checkpoint B requires location to be revealed first');
  END IF;

  SELECT correct_code
  INTO v_correct_value
  FROM variants
  WHERE variant_number = v_team.variant_number;

  v_is_correct := lower(trim(p_submitted_value)) = lower(trim(v_correct_value));

  IF v_is_correct THEN
    UPDATE teams
    SET status = 'complete',
        complete_time = COALESCE(complete_time, now())
    WHERE team_number = p_team_number;
  ELSE
    UPDATE teams
    SET wrong_attempts_b = COALESCE(wrong_attempts_b, 0) + 1
    WHERE team_number = p_team_number;
  END IF;

  RETURN json_build_object('correct', v_is_correct);
END;
$$;

GRANT EXECUTE ON FUNCTION validate_checkpoint(integer, text, text) TO anon;
GRANT EXECUTE ON FUNCTION validate_checkpoint(integer, text, text) TO authenticated;
