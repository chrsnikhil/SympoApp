import Link from "next/link";
import WebShooter, { WebNet } from "@/app/quiz/WebShooter";

/**
 * Serves app.<domain> / www.<domain> / localhost — not an event subdomain.
 * The real marketing site is a separate repo/deploy (see README); this is
 * just the platform's own front door, themed to match rather than left as
 * create-next-app boilerplate.
 *
 * Carries the web-shooter cursor here too (not just past login) — the front
 * door is most people's first and only impression of the theme before they
 * even have a coin in hand.
 */
export default function Home() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5">
      <WebShooter colour="#3a86ff" webColour="#9ec5ff" gloveColour="#e5223b" shape="classic" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, var(--web-blue-dark) 0%, transparent 60%)",
        }}
      />
      <div className="halftone panel anim-glitch-in relative w-full max-w-lg overflow-hidden p-10 text-center">
        <WebNet colour="var(--web-blue-light)" originX={94} originY={4} animate={false} />
        <WebNet colour="var(--spider-red)" originX={4} originY={98} animate={false} />
        <div className="relative">
          <p className="font-body text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">XPLORE&apos;26 · LICET</p>
          <h1 className="display-title chromatic mt-2 text-5xl text-paper-white sm:text-6xl">
            Spider Multiverse
          </h1>
          <p className="comic-shout mt-1 text-2xl text-spider-red">Tech Quiz</p>
          <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-paper-white/60">
            Three rounds. One multiverse. Enter with the number stamped on your coin.
          </p>
          <Link href="/enter" data-web-target className="comic-btn mt-8 inline-flex">
            Enter the Multiverse
          </Link>
        </div>
      </div>
    </main>
  );
}
