import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Mock localStorage for happy-dom compatibility
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Guard against unmocked fetch.
//
// API_BASE in @/lib/api is the relative path '/api/v1', and happy-dom resolves
// relative URLs against http://localhost:3000. Without this guard a component
// that fires an unmocked fetch on mount reaches for a real server: connection
// noise in the best case, a test exercising a live dev server in the worst.
//
// Mock @/lib/api at the boundary (see docs/vitest-rtl-testing-guide.md), or
// replace globalThis.fetch in the test itself when the request under test is
// the point (app/javascript/lib/api.test.ts does this).
const unmockedFetches: string[] = [];

globalThis.fetch = ((input: RequestInfo | URL) => {
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  unmockedFetches.push(url);
  const message = `Unmocked fetch to ${url}. Mock @/lib/api (or globalThis.fetch) in this test.`;
  // request() in api.ts is async, so this throw arrives as a rejected promise
  // that component-level .catch handlers swallow. Log it too, so the boundary
  // is visible even when the throw is never seen.
  console.error(message);
  throw new Error(message);
}) as typeof fetch;

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Clear localStorage to prevent state leaking between tests
  localStorage.clear();

  // Fail the test that left a fetch unmocked. Attribution is best effort: a
  // request fired after its test finished lands on whichever test is current.
  if (unmockedFetches.length > 0) {
    const urls = [...new Set(unmockedFetches)].join(', ');
    unmockedFetches.length = 0;
    throw new Error(
      `Unmocked fetch during this test: ${urls}. Mock @/lib/api (or globalThis.fetch) at the boundary.`,
    );
  }
});

// Mock window.matchMedia for components that use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock window.confirm, window.alert, and window.prompt for happy-dom compatibility
Object.defineProperty(window, 'confirm', {
  writable: true,
  value: () => true,
});

Object.defineProperty(window, 'alert', {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, 'prompt', {
  writable: true,
  value: () => null,
});

// Mock ResizeObserver for radix-ui/scroll-area
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock;

// Mock Element.scrollIntoView
Element.prototype.scrollIntoView = () => {};
