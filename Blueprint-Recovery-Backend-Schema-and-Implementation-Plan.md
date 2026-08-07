# Blueprint Recovery — Backend Schema & Implementation Plan

**Event:** College Technical Symposium — Round: Blueprint Recovery
**Build target:** Antigravity (Pro account)
**Backend:** Supabase (Postgres + Realtime + Edge Functions)
**Companion documents:** PRD, TRD, UI/UX Design Brief, Workflow Overview

---

## 1. Backend Architecture Recap

- **Database + Realtime:** Supabase Postgres, with Realtime subscriptions (or simple polling) powering the live coordinator dashboard.
- **Validation:** Checkpoint A (location) and Checkpoint B (access code) are validated **server-side** via a Supabase Edge Function, so correct answers are never exposed in client-side JavaScript.
- **Hosting:** Static frontend (built in Antigravity) deployed to any static host (Vercel/Netlify), talking to Supabase via its public client library.
- **No custom backend server required** beyond Supabase's own project + Edge Functions.

---

## 2. Database Schema

### 2.1 Table: `variants`
Fixed reference data — seeded once before the event, never modified during the event itself.

```sql
create table variants (
  variant_number integer primary key check (variant_number between 1 and 7),
  color text not null,
  sector_name text,                 -- optional in-story name, e.g. "Cryo Sector"
  correct_location text not null,   -- answer for Checkpoint A
  correct_code text not null,       -- answer for Checkpoint B
  created_at timestamp with time zone default now()
);
```

**Seed data example (fill in your real answers before the event):**
```sql
insert into variants (variant_number, color, sector_name, correct_location, correct_code) values
(1, 'Red',    'Combustion Core', 'Inspection Point',  'RED-XXXX'),
(2, 'Blue',   'Cryo Sector',     'Sector B2',         'BLU-XXXX'),
(3, 'Green',  'Bio Sector',      'Storage Bay',       'GRN-XXXX'),
(4, 'Yellow', 'Power Grid',      'Server Node',       'YLW-XXXX'),
(5, 'Orange', 'Signal Array',    'Lab Alpha',         'ORG-XXXX'),
(6, 'Purple', 'Data Vault',      'Sector C1',         'PUR-XXXX'),
(7, 'Grey',   'Archive Wing',    'Sector D3',         'GRY-XXXX');
```

### 2.2 Table: `teams`
One row per team, created when they first submit their Team Number.

```sql
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
```

**Variant assignment logic (computed at insert, not stored redundantly elsewhere):**
```sql
-- variant_number = (team_number % 7) + 1
-- Example: team_number 22 -> 22 % 7 = 1 -> variant_number 2
```
This calculation happens in the frontend or Edge Function at the moment a team submits their Team Number, then is written into the `teams` row.

### 2.3 Row Level Security (RLS)

Enable RLS on both tables. Recommended policies:

```sql
alter table teams enable row level security;
alter table variants enable row level security;

-- Teams can insert their own row (first submission)
create policy "teams can insert own row"
  on teams for insert
  with check (true); -- refine further if you add any auth layer

-- Teams can update only their own row, and only non-answer fields
create policy "teams can update own row"
  on teams for update
  using (true)
  with check (true); -- refine to scope by team_number/session if you add lightweight auth

-- Teams can read their own row only (not other teams' data)
create policy "teams can read own row"
  on teams for select
  using (true); -- refine to scope by team_number/session if you add lightweight auth

-- variants table: NOT readable by the public/team client at all.
-- Only the Edge Function (using the service role key) can read correct_location/correct_code.
-- Do not create a public select policy on `variants`.
```

**Important:** the `variants` table (containing correct answers) should have **no public read policy** at all. Only the Edge Function, using Supabase's service role key (server-side only, never shipped to the client), should be able to query it. This is what actually prevents a team from opening dev tools and reading the answers — the RLS policy is the enforcement mechanism, not just convention.

### 2.4 Table: `dashboard` view (optional convenience)
A simple view joining `teams` + `variants` for the coordinator dashboard, so it can display color/sector name alongside team status without a manual join every time:

```sql
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
```
Restrict access to this view to the coordinator route only (separate Supabase policy or a password-gated fetch through an Edge Function — do not expose it on the public team-facing client).

---

## 3. Edge Function: Answer Validation

Two things need server-side validation: Checkpoint A (location) and Checkpoint B (access code). One Edge Function can handle both, parameterized by checkpoint type.

**Pseudo-code (Supabase Edge Function, Deno/TypeScript):**

```ts
// validate-checkpoint/index.ts
import { createClient } from '@supabase/supabase-js'

serve(async (req) => {
  const { team_number, checkpoint, submitted_value } = await req.json()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL'),
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') // server-side only, never exposed to client
  )

  const { data: team } = await supabase
    .from('teams')
    .select('variant_number')
    .eq('team_number', team_number)
    .single()

  const { data: variant } = await supabase
    .from('variants')
    .select('correct_location, correct_code')
    .eq('variant_number', team.variant_number)
    .single()

  const correctValue = checkpoint === 'A' ? variant.correct_location : variant.correct_code
  const isCorrect = submitted_value.trim().toLowerCase() === correctValue.trim().toLowerCase()

  if (isCorrect) {
    const updateField = checkpoint === 'A'
      ? { status: 'checkpoint_a_done', checkpoint_a_time: new Date().toISOString() }
      : { status: 'complete', complete_time: new Date().toISOString() }
    await supabase.from('teams').update(updateField).eq('team_number', team_number)
  } else {
    const attemptField = checkpoint === 'A' ? 'wrong_attempts_a' : 'wrong_attempts_b'
    await supabase.rpc('increment_wrong_attempt', { team_number, field: attemptField })
  }

  return new Response(JSON.stringify({ correct: isCorrect }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

*(This is illustrative pseudo-code to brief your Antigravity build with — actual implementation details like the increment RPC will be finalized during build.)*

---

## 4. Screen-to-Backend Action Map

| Screen | Backend call |
|---|---|
| Team Number Entry | Calculate `variant_number`, `INSERT` (or `UPSERT`) into `teams` with `status='in_progress'`, `start_time=now()` |
| Sector Signature Reveal | `SELECT` team's variant/color for display (no write) |
| Checkpoint A submit | Call Edge Function with `checkpoint='A'` |
| Checkpoint B submit | Call Edge Function with `checkpoint='B'` |
| Mission Complete | `SELECT` team's row to display duration (no write) |
| Coordinator Dashboard | `SELECT * FROM team_dashboard`, polled every 3-5s or via Realtime subscription |
| Coordinator Reset | `UPDATE teams SET status='not_started', start_time=null, checkpoint_a_time=null, complete_time=null, wrong_attempts_a=0, wrong_attempts_b=0 WHERE team_number = ?` |

---

## 5. Environment Variables Needed

| Variable | Used where | Notes |
|---|---|---|
| `SUPABASE_URL` | Frontend + Edge Function | Public, safe to expose |
| `SUPABASE_ANON_KEY` | Frontend | Public, safe to expose; scoped by RLS policies |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function only | **Never expose to frontend** — full-access key, server-side only |
| `COORDINATOR_PASSWORD` | Coordinator route | Simple shared secret; store as an env var, not hardcoded in visible source |

---

## 6. Implementation Plan (2-Day Compressed Build: Today + Tomorrow)

Given the tight timeline, this plan is ordered by **priority, not by "nice sequence"** — everything in "Must-Have" gets built first and fully working before any visual polish starts. If you run short on time, the "Cut First If Needed" items are what to drop, not the must-haves.

### DAY 1 (Today) — Get It Working End-to-End

**Block 1 — Setup (aim: ~1 hour)**
- Create Supabase project, run schema SQL (Section 2), enable RLS policies.
- Seed `variants` table — even with placeholder answers for now if your physical puzzles aren't finalized yet; swap real answers in later, structure matters more right now than final content.
- Initialize Antigravity project, connect Supabase client, set environment variables (Section 5).

**Block 2 — Core Functional Flow, No Styling (aim: ~2-3 hours)**
- Build Team Number Entry → variant calculation → row insert. Plain HTML, no visuals.
- Build the Edge Function for Checkpoint A/B validation; test directly (curl/Postman) before wiring to UI.
- Wire up all 4 core screens as bare unstyled pages: Entry → Sector Reveal (plain text) → Checkpoint A → Checkpoint B → Complete.
- **Milestone check (do not skip):** run a full mission end-to-end with a test team number. Confirm every timestamp, status, and variant assignment writes correctly. This is the single most important checkpoint in the whole 2 days — everything visual sits on top of this, so it must be solid before moving on.

**Block 3 — Bare Coordinator Dashboard (aim: ~1 hour)**
- Plain table pulling from `team_dashboard` view. No styling yet — just confirm live data shows correctly and updates (polling is fine, skip Realtime subscription setup unless it's trivial in Antigravity — polling every 3-5s is functionally identical for this scale).

**Block 4 — Visual Foundation (aim: remaining Day 1 hours)**
- Apply palette/typography tokens (TRD Section 1.2) globally first — this alone makes everything look intentional even before animation exists.
- Build the Hero page fully (layout + at least entrance animation) — this is your visual benchmark; get it right once, then reuse its patterns everywhere else.
- Build ONE reusable transition component (`GlitchTransition`) and ONE reusable stamp component (`StampReveal`) — these two get reused across every remaining screen, so building them well now saves time tomorrow.

**End of Day 1 goal:** A fully functional, data-correct mission flow, styled with your palette/type, with the Hero page and one working transition/stamp pattern established. Not all screens beautiful yet — that's Day 2.

---

### DAY 2 (Tomorrow) — Full Visual Build-Out + Testing

**Block 1 — Remaining Screens (aim: ~3-4 hours)**
- Apply the established `GlitchTransition` and `StampReveal` components to all remaining screens: Storyline panels, Sector Signature Reveal, Checkpoint A, Physical Search holding screen, Checkpoint B, Mission Complete splash.
- Build `ComicPanel`, `SpeechBubble`, and `HalftoneOverlay` components as needed for the Storyline screen specifically (this is the most visually complex screen besides Hero).
- Drop in final copy (briefing lines, rejection lines, success line) — write these in parallel/beforehand if possible so this block isn't blocked on writing.

**Block 2 — Coordinator Dashboard Polish (aim: ~1 hour)**
- Style to the "case-file terminal" look (TRD Section 3): color-coded status pills, monospace type, congestion warning flag for teams >8 min in progress.
- Add Reset button and manual-complete override per team.

**Block 3 — Interaction Polish (aim: ~1-2 hours)**
- Apply locked decisions: cinematic 1.5s+ transitions (tune actual duration here, don't just guess), hover states on buttons/inputs, custom cursor.
- Confirm error/rejection states rotate through 2-3 lines and feel immediate, not punishing.

**Block 4 — Testing & Hardening (aim: ~1-2 hours, do not skip or compress this)**
- Full dry run: multiple test team numbers through the entire flow, confirm variant/color assignment matches your `team_number mod 7` expectation exactly.
- Test on your actual lowest-spec laptop (not just your main dev machine) — check both layout fit and animation frame rate; simplify particle/glitch intensity if it lags.
- Test `prefers-reduced-motion` fallback at least once.
- Verify text contrast against textured backgrounds is actually readable, not just "looks fine on my monitor."

**Block 5 — Deploy (aim: final hour(s) of Day 2)**
- Deploy frontend to your static host.
- Confirm Edge Function works in production, not just local dev.
- Do one final live-URL test end-to-end before calling it done.

---

### Cut First If Needed (in this order, if time runs out)
1. Custom cursor — nice touch, zero functional impact if dropped.
2. Rive/Lottie character idle animation — a static illustration still reads fine.
3. tsParticles ink-splatter bursts — a simple stamp animation without particles still works.
4. Full diagonal comic-panel clip-paths — can fall back to simpler rectangular panels with a border treatment and still look intentional.
5. **Never cut:** the core data flow (Block 2, Day 1), server-side answer validation (never expose answers client-side even under time pressure), or the Day 2 testing block — a broken mission flow or a leaked answer defeats the entire point of the round, regardless of how it looks.



---

## 7. Pre-Event Data Checklist (carries over from PRD, repeated here for backend-specific accuracy)
- [ ] All 7 rows in `variants` seeded with real, tested `correct_location` and `correct_code` values.
- [ ] Confirm variant-to-color mapping matches your physical envelope labeling exactly.
- [ ] Confirm `team_number` range you'll actually use (e.g., 1-45) has no gaps that would break assumptions elsewhere in the build.
- [ ] Coordinator password set and only shared with the coordinator(s), not visible in any public repo or client-side code.
