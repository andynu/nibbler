# Vitest + React Testing Library Guide

This document outlines best practices for writing robust, maintainable component tests using Vitest and React Testing Library (RTL) in this project.

## Core Philosophy

React Testing Library encourages testing components the way users interact with them:

> "The more your tests resemble the way your software is used, the more confidence they can give you." — Kent C. Dodds

**Test behavior, not implementation.** If a user can't see it or interact with it, don't test it.

## Query Priority

Always use the most accessible query available. This priority order exists because accessible UIs are testable UIs.

### Priority 1: Accessible Queries (Preferred)

```typescript
// Best - queries the accessibility tree
screen.getByRole('button', { name: /submit/i })
screen.getByRole('textbox', { name: /email/i })
screen.getByRole('heading', { level: 1 })
screen.getByRole('link', { name: /settings/i })
screen.getByRole('checkbox', { name: /remember me/i })
```

### Priority 2: Semantic Queries

```typescript
// Good for form fields
screen.getByLabelText(/password/i)
screen.getByPlaceholderText(/search/i)

// Good for text content
screen.getByText(/welcome back/i)
screen.getByDisplayValue('current input value')
```

### Priority 3: Test IDs (Last Resort)

```typescript
// Only when semantic queries aren't practical
screen.getByTestId('complex-widget')
```

**When to use test IDs:**
- Dynamic content where text changes frequently
- Complex custom components without proper ARIA
- Elements with no accessible name

### Queries to Avoid

```typescript
// Bad - implementation details
container.querySelector('.btn-primary')
container.querySelector('#submit-btn')
wrapper.find('Button').props()
```

## Common Mistakes

Based on Kent C. Dodds' authoritative guide on RTL mistakes:

### 1. Not Using `screen`

```typescript
// Bad - destructuring from render
const { getByRole } = render(<Component />)
getByRole('button')

// Good - use screen
render(<Component />)
screen.getByRole('button')
```

**Why:** `screen` doesn't require updating destructuring when you add/remove queries.

### 2. Using `getByTestId` as Default

```typescript
// Bad - not accessible
screen.getByTestId('submit-button')

// Good - accessible
screen.getByRole('button', { name: /submit/i })
```

### 3. Unnecessary `act()` Wrapping

```typescript
// Bad - RTL handles act() internally
await act(async () => {
  render(<Component />)
})

// Good - just render
render(<Component />)
```

### 4. Using Wrong Assertions

```typescript
// Bad - less clear error messages
expect(button).toHaveAttribute('disabled')

// Good - semantic assertion
expect(button).toBeDisabled()

// Bad
expect(element).toHaveAttribute('class', 'active')

// Good
expect(element).toHaveClass('active')
```

### 5. Side Effects in `waitFor`

```typescript
// Bad - side effects in waitFor
await waitFor(() => {
  fireEvent.click(button)  // Don't do this!
  expect(result).toBeVisible()
})

// Good - separate action from assertion
await user.click(button)
await waitFor(() => {
  expect(result).toBeVisible()
})
```

### 6. Using `waitFor` Instead of `findBy`

```typescript
// Bad - verbose
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument()
})

// Good - cleaner
await screen.findByText('Loaded')
```

## userEvent vs fireEvent

**Always prefer `userEvent`** — it simulates real user interactions.

### Setup

```typescript
import userEvent from '@testing-library/user-event'

test('user interaction', async () => {
  const user = userEvent.setup()
  render(<Component />)

  await user.click(screen.getByRole('button'))
  await user.type(screen.getByRole('textbox'), 'hello')
})
```

### Why userEvent is Better

| Action | fireEvent | userEvent |
|--------|-----------|-----------|
| Click | Single click event | hover → pointerDown → mouseDown → focus → pointerUp → mouseUp → click |
| Type | Single change event | focus → keyDown → keyPress → input → keyUp (per character) |

### When to Use fireEvent

Only when `userEvent` doesn't support the interaction:

```typescript
// userEvent doesn't support scroll
fireEvent.scroll(element, { target: { scrollTop: 100 } })

// Custom events
fireEvent(element, new CustomEvent('my-event'))
```

## Async Testing

### For Elements That Appear Later

```typescript
// Use findBy* (combines getBy + waitFor)
const button = await screen.findByRole('button', { name: /submit/i })
```

### For Assertions That Need Retrying

```typescript
// waitFor retries until assertion passes or times out
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument()
})
```

### For Multiple Async Conditions

```typescript
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument()
  expect(screen.queryByText('Loading')).not.toBeInTheDocument()
})
```

### Waiting for Element Removal

```typescript
await waitForElementToBeRemoved(() => screen.queryByText('Loading...'))
```

## Mocking Patterns

### Mocking Modules

```typescript
// Mock entire module - hoisted to top of file
vi.mock('@/lib/api', () => ({
  api: {
    feeds: {
      list: vi.fn(),
    },
  },
}))

// In tests
import { api } from '@/lib/api'

test('fetches feeds', async () => {
  vi.mocked(api.feeds.list).mockResolvedValue([
    { id: 1, title: 'Test Feed' }
  ])

  render(<FeedList />)

  await screen.findByText('Test Feed')
})
```

### Mocking Context Providers

```typescript
// Create mock for context
const mockPreferences = {
  theme: 'dark',
  date_format: 'relative',
}

vi.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: mockPreferences,
    isLoading: false,
  }),
}))

// Modify in tests
beforeEach(() => {
  mockPreferences.theme = 'light'
})
```

### Spying on Functions

```typescript
const handleClick = vi.fn()
render(<Button onClick={handleClick}>Click me</Button>)

await user.click(screen.getByRole('button'))

expect(handleClick).toHaveBeenCalledOnce()
expect(handleClick).toHaveBeenCalledWith(expect.any(Object))  // event
```

### Mock Cleanup

```typescript
beforeEach(() => {
  vi.clearAllMocks()  // Clear call history
})

afterEach(() => {
  vi.restoreAllMocks()  // Restore original implementations
})
```

## Test Structure

### Describe Blocks for Organization

```typescript
describe('EntryList', () => {
  describe('empty states', () => {
    test('shows loading spinner when isLoading is true', () => {})
    test('shows "No entries" when entries array is empty', () => {})
  })

  describe('entry rendering', () => {
    test('displays entry title', () => {})
    test('displays feed name', () => {})
    test('shows unread indicator for unread entries', () => {})
  })

  describe('interactions', () => {
    test('calls onSelect when entry is clicked', async () => {})
    test('calls onToggleRead when read button is clicked', async () => {})
  })
})
```

### Test Setup with beforeEach

```typescript
describe('FeedSidebar', () => {
  const defaultProps = {
    feeds: [],
    onSelectFeed: vi.fn(),
    onRefresh: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('renders feed list', () => {
    render(<FeedSidebar {...defaultProps} feeds={mockFeeds} />)
  })
})
```

## What to Test

### Do Test

- User-visible behavior
- Rendered output based on props
- User interactions (clicks, typing)
- Conditional rendering
- Error states
- Loading states
- Accessibility (elements are focusable, have labels)

### Don't Test

- Implementation details (internal state, private methods)
- CSS class names or inline styles
- Component instances or refs
- Third-party library internals
- Exact DOM structure

## Example: Complete Test File

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { FeedList } from './FeedList'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    feeds: {
      list: vi.fn(),
      refresh: vi.fn(),
    },
  },
}))

import { api } from '@/lib/api'

describe('FeedList', () => {
  const mockFeeds = [
    { id: 1, title: 'Tech News', unread_count: 5 },
    { id: 2, title: 'Sports', unread_count: 0 },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.feeds.list).mockResolvedValue(mockFeeds)
  })

  test('displays list of feeds', async () => {
    render(<FeedList />)

    await screen.findByText('Tech News')
    expect(screen.getByText('Sports')).toBeInTheDocument()
  })

  test('shows unread count badge for feeds with unread items', async () => {
    render(<FeedList />)

    await screen.findByText('Tech News')
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  test('calls onSelect when feed is clicked', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()

    render(<FeedList onSelect={onSelect} />)

    await user.click(await screen.findByText('Tech News'))

    expect(onSelect).toHaveBeenCalledWith(1)
  })

  test('shows loading state while fetching', () => {
    vi.mocked(api.feeds.list).mockImplementation(
      () => new Promise(() => {})  // Never resolves
    )

    render(<FeedList />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  test('shows error message when fetch fails', async () => {
    vi.mocked(api.feeds.list).mockRejectedValue(new Error('Network error'))

    render(<FeedList />)

    await screen.findByText(/failed to load/i)
  })

  test('refresh button triggers refetch', async () => {
    const user = userEvent.setup()

    render(<FeedList />)

    await screen.findByText('Tech News')
    await user.click(screen.getByRole('button', { name: /refresh/i }))

    expect(api.feeds.list).toHaveBeenCalledTimes(2)
  })
})
```

## Quick Reference

| Pattern | Use |
|---------|-----|
| `screen.getByRole()` | Default query for most elements |
| `screen.getByLabelText()` | Form inputs with labels |
| `screen.getByText()` | Static text content |
| `screen.findByRole()` | Async - element appears later |
| `screen.queryByRole()` | Assert element doesn't exist |
| `userEvent.setup()` | Create user for interactions |
| `await user.click()` | Click buttons, links |
| `await user.type()` | Type into inputs |
| `waitFor()` | Wait for assertion to pass |
| `vi.mock()` | Mock entire modules |
| `vi.fn()` | Create mock function |
| `vi.mocked()` | Type-safe mock access |

## ESLint Plugins

Install these for automatic best practice enforcement:

```bash
npm install -D eslint-plugin-testing-library eslint-plugin-jest-dom
```

## Resources

- [Testing Library Docs](https://testing-library.com/docs/)
- [Common Mistakes - Kent C. Dodds](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Query Priority](https://testing-library.com/docs/queries/about/#priority)
- [userEvent Docs](https://testing-library.com/docs/user-event/intro/)
- [Vitest Docs](https://vitest.dev/)
