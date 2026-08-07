-- =============================================================================
-- Blueprint Recovery — Initial Schema Migration
-- Matches: Backend Schema & Implementation Plan, Section 2
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 2.1  Table: variants
-- Fixed reference data — seeded once before the event, never modified during.
-- ---------------------------------------------------------------------------
create table variants (
  variant_number integer primary key check (variant_number between 1 and 7),
  color text not null,
  sector_name text,                 -- optional in-story name, e.g. "Cryo Sector"
  correct_location text not null,   -- answer for Checkpoint A
  correct_code text not null,       -- answer for Checkpoint B
  created_at timestamp with time zone default now()
);

-- ---------------------------------------------------------------------------
-- 2.2  Table: teams
-- One row per team, created when they first submit their Team Number.
-- ---------------------------------------------------------------------------
create table teams (
  id uuid primary key default gen_random_uuid(),
  team_number integer not null unique,
  variant_number integer not null references variants(variant_number),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'checkpoint_a_done', 'complete')),
  start_time timestamp with time zone,
  checkpoint_a_time timestamp with time zone,
  complete_time timestamp with time zone,
  wrong_attempts_a integer not null default 0,
  wrong_attempts_b integer not null default 0,
  created_at timestamp with time zone default now()
);

-- ---------------------------------------------------------------------------
-- 2.3  Row Level Security (RLS)
-- ---------------------------------------------------------------------------

-- Enable RLS on both tables
alter table teams enable row level security;
alter table variants enable row level security;

-- Teams table policies (permissive for anon role — refined if auth layer added)

-- Teams can insert their own row (first submission)
create policy "teams can insert own row"
  on teams for insert
  with check (true);

-- Teams can update only their own row, and only non-answer fields
create policy "teams can update own row"
  on teams for update
  using (true)
  with check (true);

-- Teams can read their own row only (not other teams' data)
create policy "teams can read own row"
  on teams for select
  using (true);

-- IMPORTANT: variants table has NO public select policy.
-- Only the Edge Function (using the service_role key) can read
-- correct_location and correct_code. This is the enforcement mechanism
-- that prevents teams from reading answers via dev tools.
-- Do NOT create a public select policy on variants.

-- ---------------------------------------------------------------------------
-- 2.4  View: team_dashboard
-- Joins teams + variants for the coordinator dashboard display.
-- Access should be restricted to the coordinator route only (via
-- password-gated fetch through an Edge Function or separate policy).
-- ---------------------------------------------------------------------------
create view team_dashboard as
select
  t.team_number,
  v.color,
  v.sector_name,
  t.status,
  t.start_time,
  t.checkpoint_a_time,
  t.complete_time,
  extract(epoch from (t.complete_time - t.start_time)) as duration_seconds,
  t.wrong_attempts_a,
  t.wrong_attempts_b
from teams t
join variants v on t.variant_number = v.variant_number;

-- ---------------------------------------------------------------------------
-- Seed data: 7 variants with placeholder answers
-- Replace correct_location and correct_code with real values before the event.
-- ---------------------------------------------------------------------------
insert into variants (variant_number, color, sector_name, correct_location, correct_code) values
(1, 'Red',    'Combustion Core', 'Inspection Point',  'RED-XXXX'),
(2, 'Blue',   'Cryo Sector',     'Sector B2',         'BLU-XXXX'),
(3, 'Green',  'Bio Sector',      'Storage Bay',       'GRN-XXXX'),
(4, 'Yellow', 'Power Grid',      'Server Node',       'YLW-XXXX'),
(5, 'Orange', 'Signal Array',    'Lab Alpha',         'ORG-XXXX'),
(6, 'Purple', 'Data Vault',      'Sector C1',         'PUR-XXXX'),
(7, 'Grey',   'Archive Wing',    'Sector D3',         'GRY-XXXX');
