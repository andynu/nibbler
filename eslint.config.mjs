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

// ---------------------------------------------------------------------------
// local/icon-only-control-needs-label
//
// lucide-react puts `aria-hidden="true"` on its svg whenever the icon has no
// children and no aria-*/role/title prop (node_modules/lucide-react/dist/cjs/
// lucide-react.js:12 and :92). A control whose entire content is such an icon
// therefore computes an EMPTY accessible name: screen readers announce nothing,
// and no `getByRole(..., { name })` locator can reach it. That is why five e2e
// tests in e2e/filters-labels.spec.ts sat skipped for eight months behind a
// `[class*="bg-muted"]` substring locator, and it has been hand-fixed six times
// in a single day (a3fe022 among them).
//
// eslint-plugin-jsx-a11y does not catch this, on two counts, both measured
// rather than assumed:
//
//   1. Its peer range is `eslint@^3 || ... || ^9` as of 6.10.2, the current
//      latest. This project is on eslint 10.9.1, so `npm install` ERESOLVEs and
//      `npm ci` fails outright -- even from a lockfile written with
//      --legacy-peer-deps, because npm ci revalidates peers. CI runs `npm ci` in
//      four jobs, so adding the plugin turns the whole workflow red.
//   2. Even with the plugin installed, `jsx-a11y/control-has-associated-label`
//      reports NOTHING on this shape. Its mayHaveAccessibleLabel() treats any
//      childless capitalised component as a possible label (lib/util/
//      mayHaveAccessibleLabel.js), and `<X className="h-4 w-4" />` is exactly
//      that. Naming the icons in `controlComponents` does defeat that branch,
//      but the same option makes every bare icon a control in its own right, so
//      a correctly labelled button reports its own icon as a violation.
//
// So the rule lives here. It is deliberately narrow: it fires only when a
// control's content is icons and nothing else, and it assumes any expression
// container, spread attribute, or unknown component renders a name. False
// negatives are the intended failure direction.
const LABELLING_PROPS = new Set(["aria-label", "aria-labelledby", "title"])

const jsxName = (node) => (node?.type === "JSXIdentifier" ? node.name : null)
const attrName = (attribute) =>
  attribute.type === "JSXAttribute" ? jsxName(attribute.name) : null
const findAttr = (opening, name) =>
  opening.attributes.find((a) => attrName(a) === name)

// An `aria-label=""` names nothing. An `aria-label={anything}` might, and this
// rule does not evaluate expressions, so it counts.
const carriesName = (opening) =>
  opening.attributes.some((a) => {
    if (!LABELLING_PROPS.has(attrName(a))) return false
    if (a.value === null) return false
    return a.value.type !== "Literal" || String(a.value.value).trim() !== ""
  })

const iconOnlyControlNeedsLabel = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require an accessible name on a control whose only content is an aria-hidden icon",
    },
    schema: [
      {
        type: "object",
        properties: {
          controlComponents: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unnamed:
        "<{{tag}}> renders only aria-hidden icons, so its accessible name is empty. Add aria-label, or an sr-only text child.",
    },
  },
  create(context) {
    const controlComponents = new Set(
      context.options[0]?.controlComponents ?? ["Button"]
    )
    const iconNames = new Set()

    // lucide adds aria-hidden only when the icon has no children AND no
    // aria-*/role/title prop, so `<Rss role="img" aria-label="Feed" />` is a
    // name, not a hidden decoration.
    const iconIsHidden = (node) =>
      node.children.length === 0 &&
      !node.openingElement.attributes.some((a) => {
        if (a.type === "JSXSpreadAttribute") return true
        const name = attrName(a)
        return (
          !!name &&
          (name.startsWith("aria-") || name === "role" || name === "title")
        )
      })

    // "text" -- something here contributes an accessible name.
    // "icon"  -- icons only, which contribute nothing.
    // "none"  -- empty; a different bug, and not this rule's business.
    const contentOf = (children) => {
      let sawIcon = false
      for (const child of children) {
        switch (child.type) {
          case "JSXText":
          case "Literal":
            if (String(child.value).trim() !== "") return "text"
            break
          case "JSXExpressionContainer":
            // {t("entries.markRead")} or {label} may well render a word. The
            // rule does not guess.
            if (child.expression.type !== "JSXEmptyExpression") return "text"
            break
          case "JSXFragment":
            if (contentOf(child.children) === "text") return "text"
            if (contentOf(child.children) === "icon") sawIcon = true
            break
          case "JSXElement": {
            const tag = jsxName(child.openingElement.name)
            if (tag && iconNames.has(tag)) {
              if (iconIsHidden(child)) {
                sawIcon = true
                break
              }
              return "text"
            }
            // aria-label on a descendant does feed the parent's name, per the
            // accname name-from-content traversal.
            if (carriesName(child.openingElement)) return "text"
            if (
              child.openingElement.attributes.some(
                (a) => a.type === "JSXSpreadAttribute"
              )
            ) {
              return "text"
            }
            const inner = contentOf(child.children)
            if (inner === "text") return "text"
            if (inner === "icon") sawIcon = true
            // A childless component that is not a known icon renders who knows
            // what. Assume a name.
            if (child.children.length === 0 && tag && /^[A-Z]/.test(tag)) {
              return "text"
            }
            break
          }
        }
      }
      return sawIcon ? "icon" : "none"
    }

    return {
      // Collected up front rather than from an ImportDeclaration visitor: an
      // import is only required to be top level, not to precede the code that
      // uses it.
      Program(node) {
        for (const statement of node.body) {
          if (
            statement.type === "ImportDeclaration" &&
            statement.source.value === "lucide-react"
          ) {
            for (const spec of statement.specifiers) {
              iconNames.add(spec.local.name)
            }
          }
        }
      },
      JSXElement(node) {
        const opening = node.openingElement
        const tag = jsxName(opening.name)
        if (!tag) return

        const isControl =
          tag === "button" ||
          (tag === "a" && !!findAttr(opening, "href")) ||
          controlComponents.has(tag)
        if (!isControl) return

        // `asChild` hands the props to the child element, which this rule
        // checks in its own right. Reporting both would double-count.
        if (findAttr(opening, "asChild")) return
        // A spread may carry aria-label, and a control hidden from the
        // accessibility tree needs no name at all.
        if (opening.attributes.some((a) => a.type === "JSXSpreadAttribute")) {
          return
        }
        if (findAttr(opening, "aria-hidden")) return
        if (carriesName(opening)) return
        if (contentOf(node.children) !== "icon") return

        context.report({ node: opening, messageId: "unnamed", data: { tag } })
      },
    }
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
    plugins: {
      "react-hooks": reactHooks,
      local: { rules: { "icon-only-control-needs-label": iconOnlyControlNeedsLabel } },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // `controlComponents` defaults to ["Button"]. Widening it to the other
      // wrappers in use here -- DropdownMenuItem, ContextMenuItem, CommandItem,
      // TabsTrigger, SelectTrigger, PopoverTrigger, TooltipTrigger -- finds
      // nothing extra, so the default is not hiding a backlog.
      "local/icon-only-control-needs-label": "error",
    },
  },
]
