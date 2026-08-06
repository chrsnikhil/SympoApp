"use client";

/**
 * Shown in place of the active game whenever the team is frozen by the
 * tab-switch strike system (see `useProctorStrikes` / `/api/quiz/flag`).
 * Deliberately not a "you're out" screen — see `ProctorFreeze` in
 * `db/types.ts` — a coordinator clears it from the admin dashboard and play
 * resumes exactly where it left off.
 *
 * `variant` matches whichever of the two look systems the round it's mounted
 * in already uses — Round 1's dark halftone/glitch-cyan theme, or Rounds
 * 2/3's lighter comic-border theme (see `ProctorGate.tsx`'s fullscreen gate).
 */
export default function FrozenScreen({
  reason,
  variant = "dark",
}: {
  reason?: string | null;
  variant?: "dark" | "light";
}) {
  const body =
    reason === "long-switch"
      ? "You left this tab for more than 10 seconds."
      : "Too many tab switches were flagged for this round.";

  if (variant === "light") {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="bg-surface comic-border p-8 md:p-12 text-center max-w-md comic-tilt-left relative overflow-hidden">
          <div className="absolute inset-0 ben-day pointer-events-none opacity-10"></div>
          <div className="text-5xl mb-3">🧊</div>
          <p className="font-display-xl text-headline-lg text-on-surface uppercase italic mb-3">Round Frozen</p>
          <p className="font-body-md text-on-surface-variant text-sm leading-relaxed mb-4">
            {body} The coordinator has been notified and can clear this from the admin dashboard.
          </p>
          <p className="font-label-sm text-primary uppercase text-xs">
            Sit tight — this isn&apos;t a disqualification. Play resumes the moment you&apos;re cleared.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-[50vh] place-items-center px-4">
      <div className="halftone panel border-4 border-spider-red relative overflow-hidden p-8 md:p-12 text-center max-w-md">
        <div className="text-5xl mb-3">🧊</div>
        <p className="font-comic text-2xl text-spider-red uppercase italic mb-3">Round Frozen</p>
        <p className="text-sm text-paper-white/80 leading-relaxed mb-4">
          {body} The coordinator has been notified and can clear this from the admin dashboard.
        </p>
        <p className="text-xs text-glitch-cyan uppercase tracking-wide font-comic">
          Sit tight — this isn&apos;t a disqualification. Play resumes the moment you&apos;re cleared.
        </p>
      </div>
    </div>
  );
}
