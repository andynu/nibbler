import { render, screen, waitForElementToBeRemoved } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SuggestedTags } from "./SuggestedTags"

// Mock the API boundary. SuggestedTags fetches entry info on mount; without
// this the relative API_BASE resolves against happy-dom's http://localhost:3000
// and hits the network.
const mockApiEntriesInfo = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entries: {
      info: (...args: unknown[]) => mockApiEntriesInfo(...args),
    },
  },
}))

// A promise the test resolves by hand, so the in-flight window is observable.
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function renderSuggestedTags(overrides: Partial<React.ComponentProps<typeof SuggestedTags>> = {}) {
  return render(
    <SuggestedTags
      entryId={1}
      existingTags={[]}
      allTags={[]}
      onAddTag={vi.fn().mockResolvedValue(undefined)}
      onRemoveTag={vi.fn().mockResolvedValue(undefined)}
      {...overrides}
    />
  )
}

describe("SuggestedTags", () => {
  beforeEach(() => {
    mockApiEntriesInfo.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("loading affordance", () => {
    it("shows a loading status while top_words is in flight", () => {
      mockApiEntriesInfo.mockReturnValue(deferred().promise)

      renderSuggestedTags()

      expect(screen.getByRole("status")).toHaveTextContent("loading suggestions")
    })

    it("replaces the loading status with the suggested words once they arrive", async () => {
      const { promise, resolve } = deferred<{ top_words: Array<{ word: string; count: number }> }>()
      mockApiEntriesInfo.mockReturnValue(promise)

      renderSuggestedTags()
      resolve({ top_words: [{ word: "rust", count: 4 }] })

      await waitForElementToBeRemoved(() => screen.queryByRole("status"))
      expect(screen.getByRole("button", { name: /rust/ })).toBeInTheDocument()
    })

    it("clears the loading status when the fetch fails", async () => {
      const { promise, reject } = deferred()
      mockApiEntriesInfo.mockReturnValue(promise)
      vi.spyOn(console, "error").mockImplementation(() => {})

      renderSuggestedTags()
      reject(new Error("boom"))

      await waitForElementToBeRemoved(() => screen.queryByRole("status"))
    })

    it("keeps applied tags and the add-tag control usable while loading", () => {
      mockApiEntriesInfo.mockReturnValue(deferred().promise)

      renderSuggestedTags({ existingTags: ["ruby"] })

      expect(screen.getByRole("status")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "ruby" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /add tag/ })).toBeInTheDocument()
    })

    it("hides the previous entry's suggestions while the next entry loads", async () => {
      const first = deferred<{ top_words: Array<{ word: string; count: number }> }>()
      mockApiEntriesInfo.mockReturnValueOnce(first.promise)

      const { rerender } = renderSuggestedTags({ entryId: 1 })
      first.resolve({ top_words: [{ word: "rust", count: 4 }] })
      await waitForElementToBeRemoved(() => screen.queryByRole("status"))

      mockApiEntriesInfo.mockReturnValueOnce(deferred().promise)
      rerender(
        <SuggestedTags
          entryId={2}
          existingTags={[]}
          allTags={[]}
          onAddTag={vi.fn().mockResolvedValue(undefined)}
          onRemoveTag={vi.fn().mockResolvedValue(undefined)}
        />
      )

      expect(screen.getByRole("status")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /rust/ })).not.toBeInTheDocument()
    })
  })
})
