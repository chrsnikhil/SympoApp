# Blueprint Recovery — UI/UX Design Brief

**Event:** College Technical Symposium — Round: Blueprint Recovery
**Status:** Final v1.0
**Companion documents:** PRD, TRD (Visual/Animation-Led), Workflow Overview

---

## 1. Design Goals

- **Zero confusion under time pressure** — teams are racing the clock, so every screen has one obvious next action. No ambiguity about what to tap or type.
- **Fast, low-stakes recovery from mistakes** — wrong code entries are expected and unpenalized; the UI treats "try again" as routine, not a failure state.
- **Legibility over spectacle, at the moments that matter** — code entry fields and the Sector Signature reveal must be instantly readable even mid-animation. Spectacle is spent deliberately elsewhere (see Section 3).
- **Coordinator efficiency** — the dashboard's UX goal is scanning speed, not immersion; it is intentionally a different design mode from the team-facing flow.

---

## 2. Information Hierarchy (Per Screen)

Every team-facing screen has exactly one primary action, visually dominant over everything else on that screen:

| Screen | Primary action | Secondary content |
|---|---|---|
| Initializing | (none — atmosphere only) | Terminal diagnostic text |
| Hero | "Begin Recovery" button | Headline, Noir operative illustration |
| Team Number Entry | The input field | Any instructional microcopy |
| Storyline / Instructions | "Next" / advance panel | Dialogue text |
| Sector Signature Reveal | (none — read only) | Color + envelope number |
| Checkpoint A (Location) | Code input + submit | Instructions, watermark state |
| Physical Search (holding) | "Enter Access Code" button | Ambient animation only |
| Checkpoint B (Access Code) | Code input + submit | Instructions, watermark state |
| Mission Complete | (none — read only) | Completion time, splash visual |
| Coordinator Dashboard | Live status table | Filters/sort controls |

---

## 3. Interaction Design Decisions (Finalized)

### 3.1 Screen Transitions
- **Duration: Cinematic, ~1.5s+.** Full glitch-tear spectacle on every screen change, embracing the signature animation fully rather than holding back.
- **Trade-off to monitor at dry-run:** with ~8-9 transitions across the full loop, this adds roughly 12-15+ seconds of pure transition time across a 4-6 minute round (~4-5% of total time). This is an accepted, deliberate choice — test with a stopwatch during the pre-event dry run (see PRD Section 6 checklist), and treat the duration as a single tunable value, not a structural decision, if it needs adjusting after seeing it live.

### 3.2 Elapsed Timer Visibility
- **Hidden.** No visible countdown/countup during the mission. Protects careful, observation-based puzzle-solving over rushed guessing, and keeps the physical-search holding screen purely atmospheric with zero pressure-inducing UI.
- This pairs deliberately with the cinematic transition choice: hiding the timer means teams aren't anxiously watching seconds tick by *while also* sitting through a longer transition — avoiding a compounding sense of lost time.

### 3.3 Error States (Checkpoints A & B)
- Wrong submission triggers: input shake, magenta glitch treatment on the watermark/stamp ("REJECTED"), and a rotating in-character rejection line (2-3 variants) so repeat wrong guesses don't feel robotic.
- Unlimited retries, no lockout, no cooldown — consistent with the confirmed no-penalty requirement.
- Input field behavior on error (clear vs. retain text) — recommend **retain**, so a team correcting a typo doesn't have to fully retype.

### 3.4 Loading / Transition States
- Every transition uses one shared, reusable animation component (see TRD Section 6) — consistent timing and feel across the whole site rather than bespoke per-screen behavior.

### 3.5 Cursor & Input Precision
- Since every team uses a laptop (mouse/trackpad), input elements can be sized for visual balance rather than thumb-friendly touch targets. Buttons/inputs should still be comfortably clickable (avoid anything smaller than ~32px tall for primary actions), but this is a visual-design decision now, not an accessibility-driven minimum.
- Hover states are supported and should be used deliberately: hover glow on primary buttons, subtle feedback on input focus/hover, and optional hover-reactive micro-animation on the Noir operative illustration.
- A custom crosshair/reticle cursor (see TRD Section 4.3) is a strong fit here and should be treated as a priority polish item, not optional, since it only works in a mouse-driven context.

### 3.6 Idle / Return Behavior
- If a team's device locks, backgrounds, or the page is refreshed mid-mission, reopening the site resumes exactly where they left off, driven by the `status` field already defined in the data model (not_started / in_progress / checkpoint_a_done / complete). No re-starting from scratch.

---

## 4. Device & Responsive Strategy (Laptop-First)

### 4.1 Device Assumption
- **Each team uses one laptop** (their own or an assigned device) for the round — not phones. This is now the sole design target for the team-facing flow; no mobile support is required.
- Laptops vary in screen size in practice — expect a range roughly **1280px–1920px wide** (common budget laptops around 1366×768 up to higher-end 1920×1080, plus 13"-14" variations). Design should flex fluidly across this range, but it is a **narrower band than a full mobile-to-desktop responsive spread**, which simplifies the layout work considerably.

### 4.2 Layout Implications
- The Hero page's left-text (~60%) / right-character (~40%) split is now the **primary, default layout** — not a "desktop enhancement" with a mobile fallback bolted on. Design and build it as the main target.
- Comic-panel layouts (Storyline, Checkpoints) can use the full diagonal-cut, multi-panel visual language at full scale without needing a simplified mobile version.
- Test the layout specifically at the narrow end of the laptop range (1366×768) to make sure the character illustration and headline don't crowd or overlap — this is the tightest realistic case, not a true mobile viewport.

### 4.3 Interaction Implications
- **Touch target sizing (44×44px) is no longer the binding constraint** — mouse/trackpad precision allows buttons and inputs to be sized for visual balance rather than thumb-friendliness.
- **Hover states become genuinely useful** and should be designed deliberately: a hover glow/shift on primary buttons ("Begin Recovery," "Submit"), subtle hover feedback on inputs, and hover-triggered micro-animation on the Noir operative illustration if desired.
- **Custom cursor** (previously listed as optional in the TRD) is now worth prioritizing rather than treating as a stretch goal — a crosshair/reticle cursor only functions with a mouse, and reinforces the surveillance/case-file tone effectively on laptop.

### 4.4 Coordinator Dashboard
- No change — already designed for laptop/desktop use, and remains so.


---

## 5. Accessibility & Inclusive Design

- **`prefers-reduced-motion` fallback defined now, not left until build time:** reduced-motion mode replaces full glitch-tears with simple fades, and removes non-essential idle/parallax animation on the Noir operative illustration, while keeping all functional content and state changes fully intact.
- **Color-system conflict check:** the site currently uses color for two separate meanings — story-state (magenta = wrong, cyan = right) and variant/sector identity (7 possible sector colors, including potentially magenta or cyan themselves). This needs an explicit resolution before build: recommend reserving magenta and cyan exclusively for state-feedback (error/success) and choosing the 7 sector colors from a separate set (e.g., red, blue, green, yellow, orange, purple, and a neutral like white/grey) to avoid a team's own "Sector Signature" visually reading as an error or success cue by accident.
- **Contrast verification:** body text and code-entry labels must be checked against the halftone/ink-textured backgrounds specifically (not just against a flat color swatch), since heavy texture behind text is a common real-world legibility failure point.
- **Keyboard focus states:** styled in-theme (e.g., a glitch-outline ring) rather than removed, so accessibility isn't silently broken by the visual redesign.

---

## 6. Microcopy & Tone Guidelines

- All button labels, instructions, and error/success messages are written in the Noir operative's voice — clipped, hard-boiled, dry-witted — never generic UI copy like "Invalid code, please try again."
- **Atmosphere never overrides clarity.** Even while in-character, the actual instructional content (what to physically do next) must remain unambiguous. A team should never be confused about their next real-world action because a line was "too in-voice" to parse quickly.
- Error messages are direct about what happened, in the interface's voice, without ever being vague or apologetic — consistent with the round's overall no-penalty, low-stakes retry philosophy.
- Each UI action keeps consistent vocabulary throughout its own flow (e.g., if a button says "Confirm," the resulting state should also say "Confirmed" — not switch to a different word for the same outcome).

---

## 7. Known Gaps Before Full Professional Handoff

This brief and its companion documents represent a complete, professional-grade *specification*. Two steps remain before it's a fully professional *deliverable*, worth doing before or during the Antigravity build rather than skipping:

1. **Visual mockups** — this document and the TRD define behavior and intent precisely, but no actual Figma/visual mockup exists yet. Recommend a quick mockup pass on at least the Hero page and one Checkpoint page before full build, to catch layout issues early.
2. **Edge-case matrix** — device failure mid-mission, two teams sharing a device, a team re-entering an already-used team number, etc. Worth a short dedicated list before the event so the coordinator has a clear fallback for each scenario rather than improvising live.
