import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // Puzzle components render and call onAnswer(text) — that's the whole
  // contract. They must never fetch (only HuntShell submits) and must never
  // import the answers.
  //
  // @/lib/hunt/codes USED TO BE BLESSED HERE as "the one client-safe hunt
  // module". It is not, and never was. SixtyFourGrid imported CODES to compare
  // against CODES.grid; bundlers do not tree-shake individual properties off an
  // object read by member expression, so all four reveal codes —
  // cipher/grid/circuit/room — shipped in the client chunk for a route where
  // three of them had not even been unlocked. Reading them took a devtools
  // search, not a solve.
  //
  // A puzzle cannot check its own answer without holding it, so it doesn't get
  // to check: it reports what the player typed, HuntShell posts it, and the
  // server hash-compares against challenge.config.answerHash. Both modules are
  // banned below so the shortcut can't come back by accident.
  {
    files: ["src/app/hunt/puzzles/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/hunt/content",
              message:
                "Puzzles never import hunt content — it carries the hints and every reveal code. Report the player's input via onAnswer(text) and let the server grade it.",
            },
            {
              name: "@/lib/hunt/codes",
              importNames: ["CODES"],
              message:
                "Never import the CODES object into a puzzle. A bundler cannot drop unused properties of an object read by member expression, so importing it for one field ships all four reveal codes — including puzzles the team has not reached yet. Import the single binding you need (ROOM_CODE, GRID_CODE, CIPHER_CODE, CIRCUIT_CODE); those ARE dropped when unused. Better still, report the player's input via onAnswer(text) and let /api/submit compare it to answerHash server-side — a puzzle that reveals its own answer in-scene, like the Mystery Room, is the only case that legitimately needs a code on the client.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "fetch",
          message:
            "Puzzles never fetch. Render, then call onSolve(code) — HuntShell is the only thing that submits.",
        },
      ],
    },
  },
]);

export default eslintConfig;
