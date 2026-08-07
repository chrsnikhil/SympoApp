# Blueprint Recovery — Website Workflow Overview

**Event:** College Technical Symposium — Round: Blueprint Recovery
**Purpose:** End-to-end walkthrough of the full team experience, from first click to logged completion, including what happens on the coordinator's side in parallel.

---

## The Complete Flow

### 1. Initializing Screen (first thing they see)
Team opens the site. Black screen, CRT scanline effect, terminal text types itself out — a few lines of in-world "system diagnostic" text hinting the Lattice network is coming online. Ends with a glitch-flash transition. Pure atmosphere, no input required yet.

### 2. Hero Page
The "cover" of the experience loads: bold headline on the left ("THE LATTICE HAS BROKEN" or similar), the Noir operative illustrated on the right, animated halftone/crack textures drifting in the background. One button: **"Begin Recovery."** This is where the team first engages.

### 3. Team Number Entry
Team clicks the button, gets a terminal-style input, types their **Team Number**, submits. The moment they submit:
- The system calculates their **Variant Number** using `(Team Number mod 7) + 1`.
- That variant number is looked up in a **fixed color table** to get their **Sector Signature** (e.g., "Blue").
- `start_time` is recorded in the database. The clock is now running on their attempt.

### 4. Storyline + Instructions
The Noir operative "speaks" — 2-4 comic panels reveal his briefing dialogue in speech bubbles, then transition into plain instructions: go collect your envelope from the coordinator.

### 5. Sector Signature Reveal
A dramatic "stamp" animation reveals their **color** and **envelope number** clearly on screen (e.g., "SECTOR: BLUE — Envelope 2"). This is the functional handoff moment — the coordinator glances at the team's screen and hands them the matching color-coded envelope containing their 20-piece blueprint puzzle.

### 6. Physical Puzzle-Solving (off-website)
Team assembles the puzzle (target: 3-4 min). Correctly assembled, it reveals a **location name** written into the blueprint itself (not "Go Here" — it's disguised as part of the schematic, e.g., "Server Node," "Lab Alpha").

### 7. Checkpoint A — Location Confirmation (back on the website)
Team types the revealed location name into the site. This is validated **against their specific variant's correct answer only** — not a shared global answer.
- **Wrong** → in-character rejection animation ("REJECTED" stamp, magenta glitch), unlimited retries, no penalty.
- **Correct** → `checkpoint_a_time` is recorded, a "CONFIRMED" stamp animation plays, and the site tells them which venue to physically go to.

### 8. Physical Search (off-website)
Team travels to that location, searches, and finds their color-matched sealed **code card** — hidden among up to 7 possible spots, but only their color/variant's card is the right one for them.

### 9. Checkpoint B — Final Access Code Entry (back on the website)
Team types in the Access Code they found. Same validation logic as Checkpoint A — checked only against their own variant.
- **Wrong** → same rejection treatment, unlimited retries.
- **Correct** → `complete_time` is recorded, `status` flips to `complete`.

### 10. Mission Complete / Sector Sealed
Full splash-page payoff: the Noir operative in a triumphant pose, "SECTOR SEALED" in huge comic type, their total time displayed. This is a **terminal state** — if they reopen the page, they see this same screen again, nothing resubmittable.

---

## Running in Parallel: Coordinator Dashboard
Separate, password-gated, not linked from the team flow. Live table auto-refreshing every few seconds, showing **every team simultaneously**: their number, assigned color, current status, all three timestamps, and total duration. A visual warning flags any team stuck "in progress" past ~8 minutes, so the coordinator can spot a bottleneck or a confused team without needing to walk around asking.

---

## Summary Loop
**Website → Physical Puzzle → Website Checkpoint A → Physical Search → Website Checkpoint B → Website Completion**, with the coordinator watching everything live in parallel the entire time.

---

## Data Captured Per Team (for reference)

| Field | Set at step |
|---|---|
| `team_number` | Step 3 |
| `variant_number` / `color` | Step 3 (calculated) |
| `start_time` | Step 3 |
| `checkpoint_a_time` | Step 7 (on correct entry) |
| `complete_time` | Step 9 (on correct entry) |
| `status` | Updated at Steps 3, 7, 9 |
| `wrong_attempts_a` / `wrong_attempts_b` | Incremented on each wrong entry at Steps 7 / 9 |
