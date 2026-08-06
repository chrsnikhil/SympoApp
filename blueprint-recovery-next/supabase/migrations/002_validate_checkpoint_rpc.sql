-- =============================================================================
-- Blueprint Recovery — Server-Side Validation Functions (v2)
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- If you already ran the v1 migration, this uses CREATE OR REPLACE
-- so it safely overwrites the existing function.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- validate_checkpoint(p_team_number, p_checkpoint, p_submitted_value)
--
-- v2 improvements:
--   1. Enforces checkpoint order:
--      - Checkpoint A only allowed when status = 'in_progress'
--      - Checkpoint B only allowed when status = 'checkpoint_a_done'
--   2. Rejects requests for teams whose status is already 'complete'
--   3. Prevents timestamp overwrites via COALESCE (idempotent writes)
--
-- Returns JSON:
--   { "correct": true/false }                — on valid attempt
--   { "correct": false, "error": "..." }     — on invalid state/input
-- ---------------------------------------------------------------------------
create or replace function validate_checkpoint(
  p_team_number integer,
  p_checkpoint text,
  p_submitted_value text
)
returns json
language plpgsql
security definer
as $$
declare
  v_team record;
  v_correct_value text;
  v_is_correct boolean;
begin
  -- -----------------------------------------------------------------------
  -- 1. Load the team row (need status + variant_number for all checks)
  -- -----------------------------------------------------------------------
  select variant_number, status
  into v_team
  from teams
  where team_number = p_team_number;

  if v_team is null then
    return json_build_object('correct', false, 'error', 'Team not found');
  end if;

  -- -----------------------------------------------------------------------
  -- 2. Reject already-complete teams (terminal state — no resubmission)
  -- -----------------------------------------------------------------------
  if v_team.status = 'complete' then
    return json_build_object('correct', false, 'error', 'Team has already completed the mission');
  end if;

  -- -----------------------------------------------------------------------
  -- 3. Enforce checkpoint order
  --    Checkpoint A: only valid when status = 'in_progress'
  --    Checkpoint B: only valid when status = 'checkpoint_a_done'
  -- -----------------------------------------------------------------------
  if p_checkpoint = 'A' and v_team.status <> 'in_progress' then
    return json_build_object('correct', false, 'error', 'Checkpoint A requires status in_progress');
  end if;

  if p_checkpoint = 'B' and v_team.status <> 'checkpoint_a_done' then
    return json_build_object('correct', false, 'error', 'Checkpoint B requires status checkpoint_a_done');
  end if;

  if p_checkpoint not in ('A', 'B') then
    return json_build_object('correct', false, 'error', 'Invalid checkpoint');
  end if;

  -- -----------------------------------------------------------------------
  -- 4. Get the correct answer for this variant and checkpoint
  -- -----------------------------------------------------------------------
  if p_checkpoint = 'A' then
    select correct_location into v_correct_value
    from variants
    where variant_number = v_team.variant_number;
  else
    select correct_code into v_correct_value
    from variants
    where variant_number = v_team.variant_number;
  end if;

  -- -----------------------------------------------------------------------
  -- 5. Case-insensitive, whitespace-trimmed comparison
  -- -----------------------------------------------------------------------
  v_is_correct := lower(trim(p_submitted_value)) = lower(trim(v_correct_value));

  -- -----------------------------------------------------------------------
  -- 6. Update team row based on result
  -- -----------------------------------------------------------------------
  if v_is_correct then
    if p_checkpoint = 'A' then
      update teams
      set status = 'checkpoint_a_done',
          checkpoint_a_time = coalesce(checkpoint_a_time, now())
      where team_number = p_team_number;
    else
      update teams
      set status = 'complete',
          complete_time = coalesce(complete_time, now())
      where team_number = p_team_number;
    end if;
  else
    if p_checkpoint = 'A' then
      update teams
      set wrong_attempts_a = wrong_attempts_a + 1
      where team_number = p_team_number;
    else
      update teams
      set wrong_attempts_b = wrong_attempts_b + 1
      where team_number = p_team_number;
    end if;
  end if;

  return json_build_object('correct', v_is_correct);
end;
$$;

-- Grant execute permission to anon role (frontend uses anon key)
grant execute on function validate_checkpoint(integer, text, text) to anon;
grant execute on function validate_checkpoint(integer, text, text) to authenticated;
