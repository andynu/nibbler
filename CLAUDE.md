# Nibbler Project Guidelines

## Project Overview

Nibbler is a modern RSS reader built with Rails 8.1 (backend) and React 19 + TypeScript (frontend). It uses esbuild for bundling, shadcn/ui components (Radix primitives), and Tailwind CSS for styling.

## Tech Stack

- **Backend**: Rails 8.1.1, SQLite, Minitest
- **Frontend**: React 19, TypeScript, esbuild
- **UI**: shadcn/ui, Radix UI, Tailwind CSS, Lucide icons
- **Testing**: Vitest + React Testing Library (components), Playwright (E2E)
- **Other**: dnd-kit (drag & drop), cmdk (command palette)

## Path Aliases

The `@` alias maps to `app/javascript/`:
```typescript
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
```

## Testing Guidelines

### Component Tests (Vitest)

Run with: `npm run test`

**Read the full guide**: [docs/vitest-rtl-testing-guide.md](docs/vitest-rtl-testing-guide.md)

Key principles:
- Use `getByRole()` as primary query (accessibility-first)
- Use `userEvent` over `fireEvent` for realistic interactions
- Use `findBy*` for async elements, `waitFor` for assertions
- Test behavior, not implementation details
- Mock at boundaries (API, contexts), not internal functions

### E2E Tests (Playwright)

Run with: `npm run test:e2e`

**Read the full guide**: [docs/playwright-testing-guide.md](docs/playwright-testing-guide.md)

Key principles:
- Use `getByRole()` as primary locator strategy
- Use `getByTestId()` only when semantic locators insufficient
- Never use hard waits (`waitForTimeout`) - rely on auto-waiting
- Keep tests isolated and focused on single behaviors
- Use Page Object Model for organization

## Issue Tracking

This project uses `bd` (beads) for issue tracking:
- `bd list` - List open issues
- `bd show <id>` - Show issue details
- `bd create "title"` - Create new issue
- Mark issues `in_progress` when starting work

## Code Style

- Prefer editing existing files over creating new ones
- Keep changes minimal and focused
- Use existing patterns found in the codebase
- No emojis in code or documentation unless requested

### Ruby Linting

Run RuboCop before committing Ruby changes to catch style issues before CI:

```bash
bundle exec rubocop                    # Check for issues
bundle exec rubocop -a                 # Auto-fix simple issues
bundle exec rubocop path/to/file.rb    # Check specific file
```

Note: CI runs the same config, so local checks match CI exactly.
