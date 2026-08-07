# Blueprint Recovery — Product Requirements Document (PRD)

**Event:** College Technical Symposium — Round: Blueprint Recovery
**Document owner:** [Your name]
**Status:** Final v2.0
**Last updated:** August 2026

---

## 1. Overview

### 1.1 Purpose
Blueprint Recovery is one of 5 independent rounds in a college technical symposium. Teams may attempt rounds in any order. This document specifies the product requirements for the website that supports the round: a digital briefing/verification layer wrapped around a physical puzzle-and-hunt experience, plus a live coordinator dashboard — including the finalized system for preventing code leakage and physical bottlenecks across ~40-45 teams sharing a single corridor.

### 1.2 Story Context
A multiversal engineering network ("the Lattice") has fractured. A noir-styled guide character contacts each team through a terminal, assigns them a sector (identified by a color signature), and walks them through recovering a shredded blueprint, locating a hidden sector, and retrieving an access code to re-seal the breach.

### 1.3 Goals
- Give each team a clear, atmospheric entry point into the round (briefing).
- Timestamp start, puzzle-solve, and completion accurately per team.
- Let teams self-serve verification at two checkpoints without coordinator intervention.
- Give the coordinator a single live view of every team's status and assigned variant.
- Eliminate code/location leakage between teams sharing a corridor.
- Eliminate physical bottlenecks from teams converging on the same spot at once.

### 1.4 Non-Goals
- Does not run or score the other 4 rounds.
- Does not replace the physical puzzle — only brackets it digitally.
- No user accounts/login beyond a Team Number.
- No payment, ticketing, or registration functionality.

---

## 2. Users & Use Cases

### 2.1 Personas

**Team member (participant)** — Enters the round in any order relative to others. Needs: identification by Team Number, an immersive briefing, clear instructions, and two simple verification steps. Time-pressured, likely on one shared device per team.

**Event Coordinator** — Runs the physical side: hands out the correct color-coded envelope, resets stations, watches for stuck/confused teams. Needs a live dashboard showing every team's status, assigned variant/color, and timestamps.

### 2.2 Core User Stories

| # | As a... | I want to... | So that... |
|---|---------|---------------|------------|
| 1 | Team member | Enter my Team Number and get an in-character briefing | I understand the mission and feel immersed |
| 2 | Team member | Be told my assigned Sector Signature (color) | I know which envelope to collect from the coordinator |
| 3 | Team member | Enter the location revealed by my puzzle | The system confirms I solved it correctly before I go search |
| 4 | Team member | Enter the access code I found at the location | I can complete the round |
| 5 | Team member | Get immediate, unpenalized feedback on wrong entries | I know to keep trying without confusion or lockout |
| 6 | Team member | See a clear "Mission Complete" state with my time | I know I'm done and can move to another round |
| 7 | Coordinator | See every team's assigned variant/color on the dashboard | I hand out the correct envelope every time, no guesswork |
| 8 | Coordinator | See live status, timestamps, and duration per team | I can manage the station and catch bottlenecks |
| 9 | Coordinator | Reset a team's record | I can fix mistakes or re-test the station |

---

## 3. The Anti-Leakage / Anti-Bottleneck System (Finalized)

### 3.1 The Problem
With one shared puzzle → one location → one code for all ~40-45 teams in a single corridor: codes get overheard, teams converge on the same spots, and the round becomes exploitable and congested.

### 3.2 The Solution — 7 Parallel Variants
Seven fully self-contained variant sets, each with:
- Its own 20-piece blueprint puzzle layout
- Its own revealed location within the venue
- Its own hidden access code
- Its own color identity, applied to every physical piece (puzzle backing, envelope, code card)

### 3.3 Variant Assignment Formula
```
Variant Number = (Team Number mod 7) + 1
```
- **Deterministic:** the same Team Number always produces the same variant, even across refreshes or re-entries — no risk of mismatched envelopes.
- **Self-balancing at any team count:** works correctly whether the final count is 35, 40, or 45 teams; each variant gets used roughly the same number of times regardless (not capped at any specific number).

**Example:** Team 22 → `22 mod 7 = 1` → remainder 1 → Variant 2.

### 3.4 Color Mapping (fixed lookup table, decided once pre-event)

| Variant Number | Color / Sector Signature |
|---|---|
| 1 | Red |
| 2 | Blue |
| 3 | Green |
| 4 | Yellow |
| 5 | Orange |
| 6 | Purple |
| 7 | Black / Grey |

The variant number is calculated from the Team Number; the color is then a simple lookup from this fixed table. The website displays the color (as "Sector Signature: Blue," etc.) rather than a raw number, since it fits the story and is what the coordinator visually matches against physical envelopes.

### 3.5 Why This Solves Both Problems

| Risk | Mechanism that solves it |
|---|---|
| Code/location leakage | A code only validates against its own variant — overhearing it is useless for any other team. |
| Corridor/hiding-spot crowding | Teams are spread across up to 7 different physical hiding spots instead of converging on one. |
| Visual mixups when spots are close together | Color-coded materials let a team instantly identify their own card even if two variants' materials end up near each other. |
| Coordinator prep/reset errors | Color mismatches are immediately obvious when repacking envelopes between teams, preventing cross-contamination of puzzle sets. |

---

## 4. Functional Requirements

### 4.1 Team-Facing Flow

**Screen 1 — Terminal / Briefing**
- Input: Team Number.
- System calculates Variant Number → looks up Color → displays both the in-character briefing (3-5 lines) and "Sector Signature: [Color]".
- Primary action: **"Begin Recovery"** → records `start_time`, sets `status = in_progress`.
- Edge case: if a team re-opens the page after starting, resume their existing status/variant rather than resetting.

**Physical step (off-website):** Coordinator hands over the envelope matching the displayed color. Envelope contains the 20-piece blueprint puzzle for that variant.

**Screen 2 — Checkpoint A: Location Confirmation**
- Team assembles the puzzle (target: 3-4 min), which reveals a location name.
- Team enters that location name into the website.
- Validated against **that team's assigned variant's correct location** (not a global answer).
- Correct → records `checkpoint_a_time`, reveals instruction to proceed to that location.
- Incorrect → short in-character rejection line, unlimited retries, no penalty (per confirmed requirement).

**Physical step (off-website):** Team travels to the confirmed location, searches, and finds the color-matched sealed code card for their variant.

**Screen 3 — Checkpoint B: Access Code Entry**
- Team enters the Access Code found at the location.
- Validated against that team's assigned variant's code.
- Correct → records `complete_time`, sets `status = complete`, transitions to Screen 4.
- Incorrect → same as above: in-character rejection line (rotate 2-3 variants), unlimited retries, no penalty; increments `wrong_attempts` for analytics only.

**Screen 4 — Sector Sealed (completion)**
- "Mission Complete" / "Sector Sealed" confirmation, showing total duration.
- Instructs team to return to the coordinator and proceed to another round.
- Terminal state — revisiting the page shows this same screen, no resubmission possible.

### 4.2 Coordinator Flow

**Access:** Separate password-gated route, not linked from the team-facing flow.

**Dashboard columns:** Team Number, Assigned Variant/Color, Status, Start Time, Checkpoint A Time, Completion Time, Total Duration, Wrong Attempts.

**Features:**
- Sortable by Duration and Status.
- Auto-refresh (poll every 3-5 seconds, or realtime subscription).
- Visual flag for teams "In Progress" beyond a set threshold (e.g., >8 minutes) to catch stuck teams or a congested hiding spot.
- Per-team **Reset** button (clears status/timestamps, e.g. for misfires or pre-event testing).
- Manual **override** to mark a team Complete (fallback if a checkpoint fails technically on the day).

### 4.3 Content Requirements
- Briefing dialogue: 3-5 lines, per color/variant if you want slight flavor differences, or one shared script (your call).
- Wrong-entry rejection lines: 2-3 variants, reused across both checkpoints.
- Success/completion line: 1 strong payoff line.
- Optional: an in-story "sector name" per color (e.g., Blue = "Cryo Sector") for thematic depth — not required for the mechanism to work.

---

## 5. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Performance | Screens load in under 1-2 seconds on event WiFi/mobile data. |
| Concurrency | Reliably handles up to ~45 teams total, realistically a handful concurrent at peak. |
| Reliability | No single point of failure halts the round; coordinator manual override exists as fallback. |
| Device support | Mobile-first responsive; works on a mid-range phone/tablet plus coordinator's device. |
| Network resilience | Assume patchy venue WiFi; keep frontend lightweight; have a paper fallback for coordinator to log completions manually if the site goes down. |
| Data integrity | Teams cannot edit their own status/timestamps or see other teams' data or answers. |
| Security | Coordinator route password-gated; correct answers validated server-side, not exposed in client-side code. |
| Simplicity of operation | One coordinator should be able to run the whole station referring only to the dashboard. |

---

## 6. Pre-Event Setup Checklist
- [ ] Finalize and print 7 blueprint puzzle variants (20 pieces each), each visually distinct in color.
- [ ] Prepare 7 color-coded envelopes, sorted in a labeled tray at the station.
- [ ] Assign and hide 7 location clue sets across the corridor/venue, matched by color.
- [ ] Seed the correct location + access code for each variant.
- [ ] Write and load briefing / rejection / success copy.
- [ ] Set up coordinator password and confirm dashboard access on the device you'll use live.
- [ ] Dry-run test: enter a few team numbers, confirm correct variant/color assignment and validation logic before the event.

---

## 7. Success Metrics
- Average completion time lands within the 4-6 minute target band.
- Zero incidents of code/location leakage affecting outcomes.
- Zero bottleneck incidents caused by physical crowding at a single hiding spot.
- Coordinator runs the station solo using only the dashboard.
- All ~40-45 teams' data captured cleanly with no missing/corrupted records.

---

## 8. Out of Scope
- Cross-round leaderboard aggregation (not built here; flag separately if needed).
- User authentication beyond the coordinator password gate.
- Team registration/roster management (assumed handled elsewhere).
- Post-event analytics/reporting beyond the live dashboard and raw data export.
