-- =============================================================================
-- Blueprint Recovery — Reveal Flow Migration (v3) — CORRECTED
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This migration is IDEMPOTENT — safe to run multiple times.
-- All statements use IF EXISTS / IF NOT EXISTS guards.
--
-- IMPORTANT: This migration TRUNCATES the teams table (clearing test data).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Clean slate — remove all test teams
-- ---------------------------------------------------------------------------
TRUNCATE TABLE teams CASCADE;

-- ---------------------------------------------------------------------------
-- 1. Drop the team_dashboard view FIRST (it depends on columns we're removing)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS team_dashboard;

-- ---------------------------------------------------------------------------
-- 2. Update status CHECK constraint
--    Old: not_started, in_progress, checkpoint_a_done, complete
--    New: not_started, in_progress, ready_for_reveal, location_revealed, complete
-- ---------------------------------------------------------------------------
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_status_check;
ALTER TABLE teams ADD CONSTRAINT teams_status_check
  CHECK (status IN ('not_started', 'in_progress', 'ready_for_reveal', 'location_revealed', 'complete'));

-- ---------------------------------------------------------------------------
-- 3. Add new timestamp columns (IF NOT EXISTS — safe to re-run)
-- ---------------------------------------------------------------------------
ALTER TABLE teams ADD COLUMN IF NOT EXISTS ready_for_reveal_time timestamptz;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS location_revealed_time timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Drop old columns (now safe — view was dropped in step 1)
-- ---------------------------------------------------------------------------
ALTER TABLE teams DROP COLUMN IF EXISTS checkpoint_a_time;
ALTER TABLE teams DROP COLUMN IF EXISTS wrong_attempts_a;

-- ---------------------------------------------------------------------------
-- 5. Recreate team_dashboard view with updated columns
-- ---------------------------------------------------------------------------
CREATE VIEW team_dashboard AS
SELECT
  t.team_number,
  v.color,
  v.sector_name,
  t.status,
  t.start_time,
  t.ready_for_reveal_time,
  t.location_revealed_time,
  t.complete_time,
  EXTRACT(EPOCH FROM (t.complete_time - t.start_time)) AS duration_seconds,
  t.wrong_attempts_b
FROM teams t
JOIN variants v ON t.variant_number = v.variant_number;

-- ---------------------------------------------------------------------------
-- 6. New RPC: get_revealed_location(p_team_number)
--
-- Security: SECURITY DEFINER — can read the variants table (RLS-locked).
-- Only returns the location when team status = 'location_revealed' or 'complete'.
-- Prevents peeking before coordinator confirms.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_revealed_location(p_team_number integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_team RECORD;
  v_location text;
BEGIN
  -- Load team
  SELECT variant_number, status
  INTO v_team
  FROM teams
  WHERE team_number = p_team_number;

  IF v_team IS NULL THEN
    RETURN json_build_object('location', NULL, 'error', 'Team not found');
  END IF;

  -- Only reveal if coordinator has confirmed
  IF v_team.status NOT IN ('location_revealed', 'complete') THEN
    RETURN json_build_object('location', NULL, 'error', 'Location not yet revealed');
  END IF;

  -- Fetch the correct location from variants (only accessible server-side)
  SELECT correct_location
  INTO v_location
  FROM variants
  WHERE variant_number = v_team.variant_number;

  RETURN json_build_object('location', v_location, 'error', NULL);
END;
$$;

-- Grant execute to anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_revealed_location(integer) TO anon;
GRANT EXECUTE ON FUNCTION get_revealed_location(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Update validate_checkpoint RPC
--    - Remove checkpoint A logic entirely
--    - Checkpoint B now requires status = 'location_revealed'
-- ---------------------------------------------------------------------------
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
  -- Load team
  SELECT variant_number, status
  INTO v_team
  FROM teams
  WHERE team_number = p_team_number;

  IF v_team IS NULL THEN
    RETURN json_build_object('correct', false, 'error', 'Team not found');
  END IF;

  -- Reject already-complete teams
  IF v_team.status = 'complete' THEN
    RETURN json_build_object('correct', false, 'error', 'Team has already completed the mission');
  END IF;

  -- Only checkpoint B is valid now
  IF p_checkpoint <> 'B' THEN
    RETURN json_build_object('correct', false, 'error', 'Invalid checkpoint — only B is supported');
  END IF;

  -- Checkpoint B requires status = 'location_revealed'
  IF v_team.status <> 'location_revealed' THEN
    RETURN json_build_object('correct', false, 'error', 'Checkpoint B requires location to be revealed first');
  END IF;

  -- Get correct code for this variant
  SELECT correct_code
  INTO v_correct_value
  FROM variants
  WHERE variant_number = v_team.variant_number;

  -- Case-insensitive, whitespace-trimmed comparison
  v_is_correct := lower(trim(p_submitted_value)) = lower(trim(v_correct_value));

  IF v_is_correct THEN
    UPDATE teams
    SET status = 'complete',
        complete_time = COALESCE(complete_time, now())
    WHERE team_number = p_team_number;
  ELSE
    UPDATE teams
    SET wrong_attempts_b = wrong_attempts_b + 1
    WHERE team_number = p_team_number;
  END IF;

  RETURN json_build_object('correct', v_is_correct);
END;
$$;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION validate_checkpoint(integer, text, text) TO anon;
GRANT EXECUTE ON FUNCTION validate_checkpoint(integer, text, text) TO authenticated;
