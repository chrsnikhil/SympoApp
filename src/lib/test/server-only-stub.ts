/**
 * A no-op stand-in for the `server-only` package, used by vitest alone.
 *
 * `server-only` throws on import unless it is being pulled into a React Server
 * Component build. That is the point of it — `src/lib/universe/words.ts` uses it
 * so a client component importing the answer words fails the build rather than
 * shipping them to a browser.
 *
 * It also means any test that imports anything reaching it dies on collection.
 * The submission pipeline reaches it through the grader registry, so mocking it
 * per-test would mean repeating the same mock in every suite that touches
 * `submit`, and forgetting it in one would look like a broken feature rather
 * than a missing stub.
 *
 * Aliased once in vitest.config.mts instead. The production guard is untouched:
 * `next build` still resolves the real package and still fails if an answer
 * module reaches the client graph.
 */
export {};
