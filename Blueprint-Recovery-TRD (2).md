# Blueprint Recovery — Technical Requirements Document (TRD)

**Event:** College Technical Symposium — Round: Blueprint Recovery
**Document owner:** [Your name]
**Status:** Final v1.0 — Visual/Animation-Led Redesign
**Last updated:** August 2026

---

## 0. Creative Reference / Inspiration Note

**Primary visual inspiration: Spider-Man Noir, as depicted in *Spider-Man: Across the Spider-Verse* (Sony/Marvel).** This is the named creative reference for the site's entire mood board — his monochrome-with-neon-glitch treatment, trench-coat/fedora noir-detective silhouette, 1930s-40s pulp-detective visual grammar fused with glitch-dimension VFX, and the film's broader hand-inked comic-panel aesthetic across the Spider-Verse (halftone dots, ink cross-hatching, dimension-collision glitch effects). Keep this as your mood board reference throughout the Antigravity build — every animation, layout, and effect spec below is built to match that feeling.

One thing worth keeping on record since this is a real, named copyrighted character/film: using his exact design/likeness as-is (rather than using it purely as a style/mood reference while designing your own character art) carries copyright/trademark exposure once the site is live publicly. That distinction is yours to navigate as the builder — noting it once here, not repeating it further. I'll refer to the guide character generically as **"the Noir operative"** through the rest of this document; swap in whatever name/branding you land on.

---

## 1. Design Direction

### 1.1 Visual Concept Summary
**"Collapsed Archive"** — a monochrome noir comic universe bleeding at the edges with neon multiversal glitch energy, styled after 1990s New York street-level comic art: heavy ink linework, cross-hatching, halftone/Ben-Day dot shading, gritty textures, dramatic panel compositions. **Direct reference: the Spider-Man Noir sequences and dimension-glitch VFX from *Spider-Man: Across the Spider-Verse*** — use screenshots/stills from that film as your primary mood-board images when briefing whoever builds this in Antigravity.

### 1.2 Token System

**Palette**
| Token | Hex | Use |
|---|---|---|
| `--ink-black` | #0B0B0D | Base background, panel fills |
| `--paper-white` | #F2F0E9 | Text on dark, comic "paper" texture base |
| `--noir-grey` | #4A4A52 | Shadows, secondary panels, cross-hatch tone |
| `--glitch-magenta` | #FF2D78 | Portal/breach energy accent, error states |
| `--glitch-cyan` | #00E5FF | Correct/success states, code-verified glow |
| `--sepia-warn` | #C9A227 | Caution/instructional highlight, envelope seals |

**Typography**
- **Display (headlines, mission titles):** A bold, condensed comic-poster face — e.g., "Bebas Neue" or "Anton" (both free, Google Fonts) for that classic comic-cover shout. Used sparingly, all-caps, tight tracking.
- **Body (briefing text, instructions):** A monospace typewriter-style face — e.g., "Space Mono" or "JetBrains Mono" — reinforces the "classified dossier / terminal" feel and contrasts against the display face.
- **Accent (speech bubbles, callouts):** A hand-inked comic lettering face — e.g., "Permanent Marker" or a licensed comic-lettering font if you want to invest — used only inside speech-bubble UI elements, never for body copy.

**Layout Concept**
- Full-bleed comic panel grid as the structural language of the entire site — not just decorative borders, but actual panel-based sectioning (each "screen" of the mission reads like a comic page turn).
- Diagonal panel cuts and gutters (not just straight rectangles) for dynamism, echoing dramatic comic splash pages.
- Signature element: **a live "portal glitch" wipe transition** between every mission stage — the panel tears/glitches apart in shards (like a comic panel ripping) to reveal the next screen, rather than a plain fade. This is the one moment of bold animation the whole site is built around; everything else stays comparatively restrained so this doesn't get diluted.

### 1.3 What Makes This Not Feel Templated
- No cream/terracotta or generic near-black/acid-green combo — palette is monochrome ink + dual neon (magenta/cyan) tied directly to the portal-breach story logic (magenta = danger/incorrect, cyan = verified/correct), so color carries narrative meaning, not decoration. This magenta/cyan-on-monochrome treatment is a direct nod to the Spider-Man Noir dimension's color grading in *Across the Spider-Verse* — reference those scenes specifically when tuning exact hex values in Antigravity.
- Panel-grid layout structure is load-bearing, not cosmetic — literally how content is organized across every screen.
- One bold signature animation (the glitch-tear transition) rather than scattered micro-animations everywhere, per the "spend your boldness in one place" principle.

---

## 2. Page-by-Page Specification

### 2.1 Initializing / Loading Page
**Purpose:** First impression, sets tone before the hero page loads.
- Black screen, CRT-style scanline texture, flickering terminal cursor.
- Typewriter-effect text types out in-world system language, e.g., diagnostic-style lines about the Lattice network coming online (write actual copy separately — this doc specs behavior, not final lines).
- Ends with a glitch-flash transition (magenta/cyan chromatic aberration split) into the Hero Page.
- **Tech:** CSS `@keyframes` for scanlines + cursor blink; a lightweight typewriter-effect library (e.g., **Typed.js**) or a hand-rolled character-reveal function for full control over timing.

### 2.2 Hero Page
**Purpose:** The comic "cover" — sets the whole story stakes before the team enters their number.
**Layout:**
- Left ~60%: Bold comic-cover-style headline ("THE LATTICE HAS BROKEN" or similar), sub-line establishing stakes, primary CTA ("Enter Team Number" / "Begin Recovery").
- Right ~40%: **The Noir operative** — your guide character, styled directly after Spider-Man Noir's look from *Across the Spider-Verse* (trench coat, fedora silhouette, monochrome ink rendering with a glowing magenta/cyan glitch aura at the edges) as the explicit visual reference. Illustrated in high-contrast ink/halftone comic style, posed dramatically. Rendered as a large-format illustrated asset (SVG or high-res PNG with transparent background), not a photo or 3D render — matches the flat comic-ink aesthetic better than 3D.
- Background: subtle animated halftone dot field + faint moving "crack" lines (like a shattering window), suggesting the breached Lattice, on a loop, low-opacity so it doesn't compete with foreground content.
**Animation on load:**
- Panels slide/snap into place in sequence (staggered reveal, not simultaneous), like pages assembling — headline first, then character, then CTA, each landing with a slight "ink impact" bounce (overshoot ease, not linear).
- Character illustration has a subtle idle animation (slow parallax drift on mouse-move or scroll, cape/coat slightly animated) — small but makes it feel alive rather than a static image.
**Tech:** GSAP for the staggered entrance timeline and scroll/mouse-based parallax (GSAP is the standard for this level of orchestrated, high-end motion — far more control than CSS-only animation for sequenced reveals).

### 2.3 Team Number Entry
**Purpose:** Functional but still in-world — feels like authenticating into a terminal, not a generic form.
- A single stylized input styled like a punch-card or terminal prompt.
- On submit: brief "verifying" glitch/scan animation (a scanning line sweeps across the screen) before transitioning.
- **Tech:** Simple state + the same GSAP glitch-transition module reused here for consistency (this transition should be one reusable component, not rebuilt per screen).

### 2.4 Storyline + Instructions
**Purpose:** The in-character briefing — this is a comic "page," not a paragraph of instructions.
- Laid out as 2-4 comic panels in sequence, each with a snippet of the Noir operative's dialogue in a speech bubble (CSS-shaped bubble with a comic-style pointed tail), revealed one at a time (tap/click "Next" or auto-paced). Voice and visual framing should echo Spider-Man Noir's hard-boiled detective narration style from *Across the Spider-Verse* — clipped, moody, dry-witted lines rather than expository text.
- Panel backgrounds use a different halftone/texture treatment for variety within the sequence, so it visually reads as distinct comic panels rather than repeating slides.
- Final panel transitions into the instructions for physically collecting the envelope.
**Tech:** GSAP timeline or **Framer Motion** (if building in React) for panel-to-panel sequencing; SVG `<clipPath>` or CSS `clip-path` for the diagonal/irregular panel shapes.

### 2.5 Sector Signature Reveal (Color + Envelope Number)
**Purpose:** The payoff moment — team learns their assigned color/variant.
- A dramatic "reveal" animation: a comic panel "stamp" effect — like an ink stamp slamming down to reveal the color and envelope number, with a satisfying impact (screen shake, ink splatter burst using an SVG filter or a lightweight particle burst).
- Large, unmistakable color swatch + envelope number displayed clearly (this is a functional UI moment — coordinator/team need to read it instantly, so despite the flourish, legibility comes first here).
**Tech:** A short GSAP timeline (scale + rotate + ink-splatter opacity burst); optionally **tsParticles** for a lightweight ink/spark particle burst if you want extra flourish without heavy asset weight.

### 2.6 Checkpoint A — Location/Venue Code Entry ("Mission Page")
**Purpose:** Styled explicitly as a mission-briefing/dossier page — not a plain form.
- Frame the input inside a "classified document" panel: redacted-text texture background, a stamped "AWAITING CONFIRMATION" watermark that changes state on submit.
- Wrong entry: watermark glitches to a magenta "REJECTED" stamp animation with a quick shake; unlimited retry, no lockout, per your requirement.
- Correct entry: watermark flips to a cyan "CONFIRMED" stamp with a satisfying snap animation, then reveals the physical destination instruction.
**Tech:** Same reusable stamp/glitch transition components as 2.5, restyled per-state (magenta reject vs. cyan confirm) so the codebase has one flexible "stamp" component, not two separate builds.

### 2.7 Physical Search (Holding Screen)
**Purpose:** Minimal-interaction screen while the team is away from the device.
- Ambient animation only (slow halftone drift, faint pulsing "signal searching" indicator) — deliberately calm, no aggressive animation here since there's no interaction to reward yet.
- Single clear "Enter Access Code" button to proceed when ready.

### 2.8 Checkpoint B — Final Access Code Entry
**Purpose:** Same "mission page" visual language as 2.6, for consistency, but framed as the final/climactic checkpoint.
- Slightly more dramatic framing than Checkpoint A (bigger panel, more prominent Noir operative presence in the background) to signal this is the final step.
- Same reject/confirm stamp logic as Checkpoint A, reusing the component.

### 2.9 Mission Complete / Sector Sealed
**Purpose:** The full-page payoff — the comic "splash page" moment.
- Full-bleed splash panel: the Noir operative in a triumphant pose (framed like a Spider-Man Noir hero shot from *Across the Spider-Verse*), "SECTOR SEALED" in massive comic display type, comic-burst background (radiating halftone lines, classic comic "impact" starburst).
- Team's completion time displayed prominently, styled like a stamped case-file number.
- This is the second (and last) place you spend real animation boldness — a satisfying multi-layer entrance (background burst → character → text stamp, staggered) — deliberately bigger than any other screen's animation, since it's the reward moment.
**Tech:** GSAP master timeline combining scale, stagger, and the ink-splatter/burst effect established earlier — reusing the same visual language (not inventing new effects) for cohesion.

---

## 3. Coordinator Dashboard (Separate, Simpler Visual Track)
The dashboard is a **utility screen**, not a story screen — deliberately less illustrated/animated than the team-facing flow, styled as a clean "case-file terminal": monospace type, dark background, color-coded status badges matching the 7 sector colors, subtle scanline texture for consistency but no heavy character illustration or panel-transition animation (it needs to be glanceable and fast, not immersive).
- Live-updating table, sortable, with a color-coded pill per team matching their assigned Sector Signature.
- Congestion flag (teams stuck >8 min) styled as a pulsing magenta warning badge, consistent with the reject-state color logic established in the team flow.

---

## 4. Technology Stack (Advanced Tools, as Requested)

### 4.1 Frontend Framework
- **React** (recommended) — component reuse (the stamp/glitch/transition components get reused across 5+ screens, which React handles far more cleanly than plain HTML/JS at this level of interactivity).

### 4.2 Animation & Motion
| Tool | Purpose |
|---|---|
| **GSAP + ScrollTrigger** | Industry-standard for orchestrated, high-end sequenced animation — staggered reveals, timeline-based transitions, the signature glitch-tear effect. This is the backbone of the whole motion system. |
| **Framer Motion** | React-native animation for simpler component-level transitions (panel enter/exit, button states) where a full GSAP timeline is overkill. |
| **Lottie** (via `lottie-react`) | If you or a designer produce any After-Effects-built animation (e.g., a more complex Noir-operative idle-animation loop), Lottie plays it back as lightweight vector animation rather than heavy video. |
| **tsParticles** | Lightweight particle system for the ink-splatter/spark-burst effects on stamps and the Mission Complete splash, without hand-building canvas particle code. |
| **Rive** (optional, higher-end) | If you want the Noir operative to have genuinely interactive character animation (blinking, subtle movement reacting to state) rather than a static illustration, Rive is the current best tool for lightweight, real-time-interactive vector character animation — a meaningful step up from a static SVG if you have time to invest in it. |

### 4.3 Visual Effects (Comic/Halftone/Glitch Look)
- **SVG filters** (`feTurbulence`, `feColorMatrix`, `feComponentTransfer`) for halftone dot textures and ink-grain overlays — generated procedurally rather than using static texture images, so they stay crisp at any screen size.
- **CSS `mix-blend-mode`** (`multiply`, `screen`) for layering halftone/texture over illustrations authentically, comic-print style.
- **Chromatic aberration / glitch effect:** achievable via layered `clip-path` + slight RGB-channel offset animation (a well-documented CSS/SVG technique) for the portal-glitch transitions — no heavy library needed, just precise CSS.
- **Custom cursor** (optional nice touch): a small crosshair/reticle cursor on hover for interactive elements, reinforcing the "surveillance/case-file" feel.

### 4.4 Illustration Asset Creation
Since the Noir operative character and comic-panel textures need real illustrated assets (not just code-generated effects):
- Use **Spider-Man Noir's design from *Across the Spider-Verse* as your direct mood-board/style reference** (silhouette, coat, color grading, ink rendering style) when briefing an illustrator or AI image tool — but have the final character design be **your own original artwork inspired by that style**, rather than a 1:1 recreation of the copyrighted character, since that's what keeps the site safe to publish publicly for the event. Deliver as layered SVG or high-res transparent PNG so it composites cleanly into the animated hero/splash scenes.
- Background textures (cross-hatching, halftone paper grain) can be procedurally generated (see 4.3) rather than illustrated by hand, to save time/budget.

### 4.5 Smooth Scroll / Feel
- **Lenis** (or Locomotive Scroll) for smooth, weighted scroll physics on the Hero page — gives that high-end "every scroll feels intentional" quality rather than default browser scroll snap.

### 4.6 Backend / Data (carried over, unchanged from prior TRD draft)
- **Supabase** (Postgres + realtime) for the `teams` and `variants` tables, validation logic, and live dashboard updates — see prior technical draft for full schema if needed; this section focuses on the visual/animation layer per your redesign request.

---

## 5. Performance & Accessibility Guardrails (non-negotiable even in a maximalist design)
- Respect `prefers-reduced-motion` — provide a reduced-motion fallback (simple fades instead of full glitch-tears) for accessibility; this doesn't have to look impressive to any team you'd actually offer it to, it just needs to exist.
- Illustration assets optimized/compressed (SVG minified, PNGs served responsively) so the Hero page still loads in 1-2 seconds on event WiFi despite the heavier visual system.
- Keyboard focus states styled in-theme (a glitch-outline focus ring, not a default blue browser outline) so accessibility isn't visually broken by the redesign.
- Test the full animation sequence on a **mid-spec laptop** specifically (e.g., a common budget laptop with integrated graphics, not just your high-end dev machine) before the event — GSAP/particle-heavy scenes can lag on weaker hardware; drop particle density or simplify the burst effect if frame rate suffers. Since every team uses a laptop rather than a phone, this is now the primary device-testing target — no mobile-device testing is required.

---

## 6. Component Reuse Map (for efficient Antigravity build)
To avoid rebuilding similar effects five separate times, structure the build around these reusable components:

| Component | Used on screens |
|---|---|
| `GlitchTransition` | Every screen-to-screen transition (2.1→2.9) |
| `StampReveal` (reject/confirm states) | Sector Signature reveal, Checkpoint A, Checkpoint B |
| `ComicPanel` (diagonal clip-path container) | Storyline panels, Mission pages, Dashboard cards |
| `SpeechBubble` | Storyline briefing only |
| `HalftoneOverlay` (SVG filter layer) | Background of every screen, opacity/scale varied per context |
| `ArchivistIllustration` (with idle animation) | Hero page, Storyline panels, Mission Complete splash |

Building these six components once, then composing every screen from them, is what keeps a "high-end, non-boring" visual system achievable without needing to hand-craft nine completely bespoke screens from scratch.
