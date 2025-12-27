import { vi } from "vitest"

/**
 * Mock API object that mirrors the structure of the real api export.
 * Use this in tests with: vi.mock('@/lib/api', () => ({ api: mockApi }))
 */
export const mockApi = {
  feeds: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    refresh: vi.fn(),
    refreshAll: vi.fn(),
  },
  entries: {
    list: vi.fn(),
    get: vi.fn(),
    update: vi.fn(),
    toggleRead: vi.fn(),
    toggleStarred: vi.fn(),
    markAllRead: vi.fn(),
  },
  categories: {
    list: vi.fn(),
    tree: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  preferences: {
    get: vi.fn(),
    update: vi.fn(),
  },
  filters: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    test: vi.fn(),
  },
  tags: {
    list: vi.fn(),
  },
  labels: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  entryLabels: {
    add: vi.fn(),
    remove: vi.fn(),
  },
  opml: {
    preview: vi.fn(),
    import: vi.fn(),
    exportUrl: vi.fn(),
  },
}

/**
 * Reset all mock functions in the mockApi object.
 * Call this in beforeEach to ensure clean state between tests.
 */
export function resetApiMocks(): void {
  Object.values(mockApi).forEach((namespace) => {
    Object.values(namespace).forEach((fn) => {
      if (typeof fn === "function" && "mockReset" in fn) {
        fn.mockReset()
      }
    })
  })
}

/**
 * Helper to create a mock that resolves to a value.
 * @example mockApi.feeds.list.mockResolvedValue([mockFeed()])
 */
export function setupMockResolvedValue<T>(
  mockFn: ReturnType<typeof vi.fn>,
  value: T
): void {
  mockFn.mockResolvedValue(value)
}

/**
 * Helper to create a mock that rejects with an error.
 * @example setupMockRejectedValue(mockApi.feeds.list, new Error('Network error'))
 */
export function setupMockRejectedValue(
  mockFn: ReturnType<typeof vi.fn>,
  error: Error
): void {
  mockFn.mockRejectedValue(error)
}
