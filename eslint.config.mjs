import babelParser from "@babel/eslint-parser"
import reactHooks from "eslint-plugin-react-hooks"

// Deliberately narrow. "Lint" in this repo means RuboCop; this config exists for
// the one JavaScript rule that has a demonstrated miss here (ttrb-qlpd: an early
// return above a useCallback and two useEffects in SidebarDrawer.tsx, which React
// 19.2 does not throw on and no test caught). Widening to eslint:recommended or
// the typescript-eslint presets would surface a backlog across app/javascript
// that is a separate, deliberate cleanup.
//
// The parser is Babel's rather than typescript-eslint's because typescript-eslint
// 8.68 hard-throws on TypeScript 7 ("typescript-eslint does not support TS 7.0",
// tracked at typescript-eslint#10940) and this project is on typescript 7.0.2.
// Its only escape hatch is aliasing the `typescript` dependency back to
// @typescript/typescript6, which would drag `npm run typecheck` back to the TS 6
// compiler. Babel parses the syntax without needing a type checker, which is all
// the react-hooks rules ask for.
const babelTypeScript = {
  parser: babelParser,
  parserOptions: {
    requireConfigFile: false,
    sourceType: "module",
    babelOptions: {
      babelrc: false,
      configFile: false,
      // Babel 8's eslint parser reads syntax plugins from parserOpts only; a
      // preset listed here is resolved but never reaches @babel/parser, so
      // `interface` fails to parse.
      parserOpts: { plugins: ["typescript", "jsx"] },
    },
  },
}

export default [
  {
    // A config object holding only `ignores` sets global ignores, which prune
    // the directory walk rather than merely filtering results.
    ignores: [
      "app/assets/builds/**",
      "coverage/**",
      "playwright-report/**",
      "public/**",
      "test-results/**",
      "vendor/**",
      // Agent git worktrees live under .claude/worktrees/<name>/, each a full
      // checkout of this repo. Without this, `eslint .` reports every warning
      // once per live worktree (ttrb-gr0z: 21 warnings became 42 with one
      // worktree on disk), which makes a baseline count meaningless and hides
      // real new warnings in the noise. ESLint 10 also resolves the nested
      // eslint.config.mjs inside each worktree, so the copies are linted with
      // their own rules. `**/` so a checkout nested any deeper is covered too.
      "**/.claude/**",
    ],
  },
  {
    // React lives only under app/javascript. e2e/ is Playwright, whose fixture
    // callbacks take a parameter named `use`; run the react-hooks rules over it
    // and every fixture reads as a conditional call to React's `use` hook.
    files: ["app/javascript/**/*.{ts,tsx}"],
    languageOptions: babelTypeScript,
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
]
