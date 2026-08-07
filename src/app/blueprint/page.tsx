import BlueprintFlow from "./BlueprintFlow";

/**
 * Blueprint Recovery — reached from the hunt, gated by the proxy.
 *
 * `/blueprint` is a top-level route tree, so it needs to be in BOTH of the
 * proxy's lists: PROTECTED_PREFIXES to require a session, and
 * NO_REWRITE_PREFIXES so an event subdomain does not rewrite it into
 * /hunt/blueprint and 404. That trap has caught /universe once already.
 */
export default function BlueprintPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden px-5 py-10">
      <div className="web-bg" />
      <div className="relative mx-auto max-w-3xl">
        <a
          href="/hunt"
          className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-paper-white/40 hover:text-paper-white/70"
        >
          ← All puzzles
        </a>
        <h1 className="display-title chromatic mt-3 text-4xl text-paper-white sm:text-5xl">
          Blueprint Recovery
        </h1>
        <p className="mt-2 font-mono text-xs text-paper-white/40">hunt-blueprint</p>
        <div className="punk-divider mt-5" />
        <div className="mt-6">
          <BlueprintFlow />
        </div>
      </div>
    </main>
  );
}
