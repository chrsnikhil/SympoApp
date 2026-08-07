-- =============================================================================
-- Blueprint Recovery — Migration 006: Enable Supabase Realtime for Teams Table
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- Adds the `teams` table to the `supabase_realtime` publication so that
-- instant WebSocket push updates work for both the Coordinator Dashboard
-- and the Team Waiting screen (eliminating the 3-5s polling delay).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE teams;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL; -- Already added
END $$;
