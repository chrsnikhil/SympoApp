import Link from "next/link";
import WebShooter, { WebNet } from "@/app/quiz/WebShooter";

/**
 * Serves app.<domain> / www.<domain> / localhost.
 * Platform front door themed with Spider-Verse Symposium styling.
 */
export default function Home() {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5 bg-transparent font-body-md text-on-surface">
      <WebShooter colour="#a41616" webColour="#41617e" gloveColour="#1b1b1c" shape="classic" />

      {/* Background radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, rgba(164,22,22,0.15) 0%, transparent 60%)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg bg-surface comic-border p-8 md:p-12 text-center comic-tilt-left">
        <WebNet colour="#41617e" originX={94} originY={4} animate={false} />
        <WebNet colour="#a41616" originX={4} originY={98} animate={false} />

        <div className="relative z-10">
          <p className="font-label-sm text-primary uppercase tracking-[0.25em] mb-2">XPLORE&apos;26 · LICET</p>
          
          <h1
            className="font-display-xl text-4xl sm:text-6xl uppercase italic text-on-background tracking-tighter drop-shadow-[4px_4px_0px_rgba(164,22,22,1)] leading-none mb-3"
            style={{ WebkitTextStroke: "2px #1b1b1c" }}
          >
            Spider Multiverse
          </h1>
          
          <div className="bg-primary text-on-primary font-headline-lg text-headline-lg-mobile px-4 py-1 comic-border inline-block -rotate-2 mb-4">
            TECH QUIZ
          </div>

          <p className="font-body-md text-on-surface-variant text-sm sm:text-base leading-relaxed max-w-sm mx-auto mb-8">
            Three rounds. One multiverse. Enter with the number stamped on your coin or your access code.
          </p>

          <Link
            href="/enter"
            data-web-target=""
            className="relative bg-primary px-8 py-4 comic-border comic-tilt-right inline-flex transition-all duration-100 hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[6px_6px_0px_0px_rgba(27,27,28,1)] active:scale-95"
          >
            <span className="font-display-xl text-headline-lg-mobile text-on-primary uppercase tracking-widest">
              Enter the Multiverse
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
