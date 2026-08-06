-- =============================================================================
-- Blueprint Recovery — Migration 005: Coordinator Action RPC + Config Table
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This migration:
--   1. Creates an RLS-locked `app_config` table to store system settings.
--   2. Seeds 'coordinator_password' key (value: 'CHANGE_ME_BEFORE_EVENT').
--   3. Truncates the teams table (fresh start).
--   4. Creates strict coordinator_action() RPC with SECURITY DEFINER:
--      - Reads coordinator_password server-side from `app_config`.
--      - FAILS CLOSED if app_config entry is missing or empty.
--      - Validates state transitions for reveal, reset, and override actions.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create app_config table & seed coordinator_password
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS — DO NOT create any public SELECT/INSERT/UPDATE policies.
-- Public anon users CANNOT read this table via Supabase REST API.
-- Only SECURITY DEFINER functions (server-side) can query it.
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Insert or update default coordinator password
INSERT INTO app_config (key, value)
VALUES ('coordinator_password', 'CHANGE_ME_BEFORE_EVENT')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ---------------------------------------------------------------------------
-- 2. Clean slate — remove ALL existing teams
-- ---------------------------------------------------------------------------
TRUNCATE TABLE teams CASCADE;

-- ---------------------------------------------------------------------------
-- 3. coordinator_action RPC
--    Accepts: action ('reveal' | 'reset' | 'override'), team_number, password
--    Validates exact password and allowed state transitions server-side.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION coordinator_action(
  p_action text,
  p_team_number integer,
  p_password text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_expected_password text;
  v_team RECORD;
  v_now timestamptz := now();
BEGIN
  -- Read expected password from RLS-locked app_config table
  SELECT value INTO v_expected_password
  FROM app_config
  WHERE key = 'coordinator_password';

  -- FAIL CLOSED: If setting is not configured, refuse to act entirely
  IF v_expected_password IS NULL OR trim(v_expected_password) = '' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'COORDINATOR_PASSWORD_NOT_CONFIGURED: app_config entry for coordinator_password is missing'
    );
  END IF;

  -- STRICT AUTH: Require exact password match
  IF p_password IS NULL OR trim(p_password) <> trim(v_expected_password) THEN
    RETURN json_build_object('success', false, 'error', 'UNAUTHORIZED_COORDINATOR_ACTION');
  END IF;

  -- Verify team exists
  SELECT * INTO v_team FROM teams WHERE team_number = p_team_number;
  IF v_team IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Team not found');
  END IF;

  -- Execute action with state transition safety guards
  CASE p_action
    WHEN 'reveal' THEN
      IF v_team.status <> 'awaiting_reveal' THEN
        RETURN json_build_object(
          'success', false,
          'error', 'INVALID_STATE_TRANSITION: Team must be in awaiting_reveal status to perform reveal (current status: ' || v_team.status || ')'
        );
      END IF;

      UPDATE teams
      SET status = 'checkpoint_a_done',
          checkpoint_a_time = v_now
      WHERE team_number = p_team_number;

    WHEN 'reset' THEN
      IF v_team.status = 'not_started' THEN
        RETURN json_build_object(
          'success', false,
          'error', 'INVALID_STATE_TRANSITION: Team is already in not_started status'
        );
      END IF;

      UPDATE teams
      SET status = 'not_started',
          start_time = NULL,
          checkpoint_a_time = NULL,
          complete_time = NULL,
          wrong_attempts_b = 0
      WHERE team_number = p_team_number;

    WHEN 'override' THEN
      IF v_team.status = 'complete' THEN
        RETURN json_build_object(
          'success', false,
          'error', 'INVALID_STATE_TRANSITION: Team has already completed the mission'
        );
      END IF;

      IF v_team.status = 'not_started' THEN
        RETURN json_build_object(
          'success', false,
          'error', 'INVALID_STATE_TRANSITION: Cannot override a team that has not started'
        );
      END IF;

      UPDATE teams
      SET status = 'complete',
          complete_time = v_now
      WHERE team_number = p_team_number;

    ELSE
      RETURN json_build_object('success', false, 'error', 'Invalid action: ' || p_action);
  END CASE;

  -- Return updated team row
  SELECT row_to_json(t) INTO v_team FROM (
    SELECT * FROM teams WHERE team_number = p_team_number
  ) t;

  RETURN json_build_object('success', true, 'data', v_team);
END;
$$;

-- Grant execute to anon and authenticated (password is validated strictly inside the function)
GRANT EXECUTE ON FUNCTION coordinator_action(text, integer, text) TO anon;
GRANT EXECUTE ON FUNCTION coordinator_action(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION coordinator_action(text, integer, text) TO service_role;
