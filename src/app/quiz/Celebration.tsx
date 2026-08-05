/**
 * A brief burst of brand-palette confetti — CSS-only, no external art, no
 * randomness (the fan-out angles are computed once at module load from a
 * fixed count, so this is deterministic and safe to render on the server).
 * Used at the two genuine "you did it" moments: finishing Round 1 and
 * finishing the whole event. `prefers-reduced-motion` turns it off entirely
 * (see the `.confetti-piece` rule in globals.css) rather than slowing it down
 * — a stopped-mid-air burst reads as more broken than none at all.
 */

interface Piece {
  dx: number;
  dy: number;
  rot: number;
  delayMs: number;
  colour: string;
  shape: "square" | "triangle";
}

const PALETTE = ["var(--spider-red)", "var(--web-blue-light)", "var(--glitch-cyan)", "var(--gadget-pink)", "var(--paper-white)"];
const COUNT = 18;

const PIECES: Piece[] = Array.from({ length: COUNT }, (_, i) => {
  const angle = (i / COUNT) * Math.PI * 2;
  const distance = 90 + (i % 3) * 34;
  return {
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance),
    rot: (i * 53) % 360,
    delayMs: (i % 5) * 35,
    colour: PALETTE[i % PALETTE.length],
    shape: i % 2 === 0 ? "square" : "triangle",
  };
});

export default function Celebration() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-visible">
      {PIECES.map((p, i) => {
        const style: React.CSSProperties = {
          animationDelay: `${p.delayMs}ms`,
          ["--confetti-dx" as string]: `${p.dx}px`,
          ["--confetti-dy" as string]: `${p.dy}px`,
          ["--confetti-rot" as string]: `${p.rot}deg`,
        };
        if (p.shape === "square") {
          style.background = p.colour;
        } else {
          style.width = 0;
          style.height = 0;
          style.borderLeft = "5px solid transparent";
          style.borderRight = "5px solid transparent";
          style.borderBottom = `8px solid ${p.colour}`;
        }
        return <span key={i} className="confetti-piece" style={style} />;
      })}
    </span>
  );
}
