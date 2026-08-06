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
  // Puzzle components render and call onSolve(code) — that's the whole
  // contract. They must never fetch (only HuntShell submits) and must never
  // import @/lib/hunt/content (it carries hints and is server/shell-only;
  // @/lib/hunt/codes is the one client-safe hunt module). This was enforced
  // by convention only; make the two invariants a lint error so puzzle
  // components can't drift from them by accident.
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
                "Puzzles never import hunt content (it carries hints/answerHash). Use @/lib/hunt/codes if you need a client-safe code, or lift the logic into HuntShell.",
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
