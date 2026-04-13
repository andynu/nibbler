import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

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

// Cleanup after each test
afterEach(() => {
  cleanup();
  // Clear localStorage to prevent state leaking between tests
  localStorage.clear();
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
global.ResizeObserver = ResizeObserverMock;

// Mock Element.scrollIntoView
Element.prototype.scrollIntoView = () => {};
