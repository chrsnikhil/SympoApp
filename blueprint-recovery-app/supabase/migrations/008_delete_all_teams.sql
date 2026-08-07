-- ============================================================================
-- SQL Migration Script 008: Delete / Reset All Teams
-- Run this in your Supabase SQL Editor to wipe/reset all team progress.
-- ============================================================================

-- OPTION 1: Reset all team entries back to 'not_started' status (Clean Slate)
UPDATE public.teams
SET 
  status = 'not_started',
  start_time = NULL,
  checkpoint_a_time = NULL,
  complete_time = NULL,
  wrong_attempts_a = 0,
  wrong_attempts_b = 0,
  last_updated = NOW();

-- OPTION 2: Completely delete all rows from the teams table
-- DELETE FROM public.teams;
