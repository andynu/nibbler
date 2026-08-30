import { render, screen, waitFor, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PreferencesProvider, usePreferences } from "./PreferencesContext"
import type { Preferences } from "@/lib/api"
import { ThemeProvider } from "./ThemeContext"
import { mockPreferences } from "../../../test/fixtures/data"

// Mock the API
const mockApiGet = vi.fn()
const mockApiUpdate = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    preferences: {
      get: () => mockApiGet(),
      update: (data: any) => mockApiUpdate(data),
    },
  },
}))

// Mock the accent colors module
vi.mock("@/lib/accentColors", () => ({
  applyAccentColors: vi.fn(),
  DEFAULT_ACCENT_HUE: 210,
}))

// Test component that uses the context
function TestConsumer() {
  const { preferences, isLoading, updatePreference, updatePreferences } =
    usePreferences()

  return (
    <div>
      <div data-testid="loading">{isLoading ? "loading" : "loaded"}</div>
      <div data-testid="theme">{preferences.theme}</div>
      <div data-testid="date-format">{preferences.date_format}</div>
      <button
        onClick={() => updatePreference("theme", "dark")}
        data-testid="update-single"
      >
        Update theme
      </button>
      <button
        onClick={() =>
          updatePreferences({ theme: "light", date_format: "short" })
        }
        data-testid="update-batch"
      >
        Update batch
      </button>
    </div>
  )
}

// Nested as application.tsx nests them. The provider hands the loaded theme to
// ThemeProvider, which sits above it because it paints the login form too, so
// the two are only meaningful together.
function renderProvider() {
  return render(
    <ThemeProvider>
      <PreferencesProvider>
        <TestConsumer />
      </PreferencesProvider>
    </ThemeProvider>
  )
}

describe("PreferencesContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default successful response
    mockApiGet.mockResolvedValue(mockPreferences())
    mockApiUpdate.mockResolvedValue(mockPreferences())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("initial state", () => {
    it("provides default preferences before API loads", () => {
      // Make API hang so we can see loading state
      mockApiGet.mockImplementation(
        () => new Promise(() => {})
      )

      renderProvider()

      // Should have default values before load completes
      expect(screen.getByTestId("theme")).toHaveTextContent("system")
      expect(screen.getByTestId("date-format")).toHaveTextContent("relative")
    })

    it("sets isLoading true initially", () => {
      mockApiGet.mockImplementation(
        () => new Promise(() => {})
      )

      renderProvider()

      expect(screen.getByTestId("loading")).toHaveTextContent("loading")
    })

    it("calls api.preferences.get() on mount", () => {
      renderProvider()

      expect(mockApiGet).toHaveBeenCalledOnce()
    })
  })

  describe("loading preferences", () => {
    it("updates preferences when API returns", async () => {
      mockApiGet.mockResolvedValue(
        mockPreferences({ theme: "dark", date_format: "iso" })
      )

      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("theme")).toHaveTextContent("dark")
        expect(screen.getByTestId("date-format")).toHaveTextContent("iso")
      })
    })

    it("sets isLoading false after load", async () => {
      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })
    })

    it("handles API error gracefully (keeps defaults)", async () => {
      mockApiGet.mockRejectedValue(new Error("Network error"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      // Should still have default values
      expect(screen.getByTestId("theme")).toHaveTextContent("system")

      consoleSpy.mockRestore()
    })
  })

  describe("updatePreference", () => {
    it("optimistically updates local state", async () => {
      renderProvider()

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      // Click update button
      act(() => {
        screen.getByTestId("update-single").click()
      })

      // Should update immediately (optimistic)
      expect(screen.getByTestId("theme")).toHaveTextContent("dark")
    })

    it("calls api.preferences.update with correct data", async () => {
      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-single").click()
      })

      await waitFor(() => {
        expect(mockApiUpdate).toHaveBeenCalledWith({ theme: "dark" })
      })
    })

    it("reverts and refetches on API error", async () => {
      mockApiUpdate.mockRejectedValue(new Error("Update failed"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      // Second get call (for revert) returns original preferences
      mockApiGet
        .mockResolvedValueOnce(mockPreferences({ theme: "system" }))
        .mockResolvedValueOnce(mockPreferences({ theme: "system" }))

      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-single").click()
      })

      // Wait for error handling
      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledTimes(2) // Initial + revert
      })

      consoleSpy.mockRestore()
    })
  })

  describe("updatePreferences (batch)", () => {
    it("updates multiple preferences at once", async () => {
      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-batch").click()
      })

      // Both should update
      expect(screen.getByTestId("theme")).toHaveTextContent("light")
      expect(screen.getByTestId("date-format")).toHaveTextContent("short")
    })

    it("calls API with batch update", async () => {
      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-batch").click()
      })

      await waitFor(() => {
        expect(mockApiUpdate).toHaveBeenCalledWith({
          theme: "light",
          date_format: "short",
        })
      })
    })

    it("reverts on error", async () => {
      mockApiUpdate.mockRejectedValue(new Error("Update failed"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      mockApiGet
        .mockResolvedValueOnce(mockPreferences())
        .mockResolvedValueOnce(mockPreferences())

      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-batch").click()
      })

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledTimes(2)
      })

      consoleSpy.mockRestore()
    })
  })

  // Every other example here waits for the boot load to finish before writing
  // anything, which is why this went unnoticed: the reply and the write never
  // overlapped. These two put the write inside the window instead.
  describe("a write racing the boot load", () => {
    it("keeps a preference written while the boot reply was still in flight", async () => {
      let releaseGet: (value: Preferences) => void = () => {}
      mockApiGet.mockImplementation(
        () => new Promise<Preferences>((resolve) => { releaseGet = resolve })
      )

      renderProvider()

      // The reader clicks before the account's preferences have arrived.
      act(() => {
        screen.getByTestId("update-single").click()
      })
      expect(screen.getByTestId("theme")).toHaveTextContent("dark")

      // The boot reply lands afterwards, carrying the pre-click value.
      await act(async () => {
        releaseGet(mockPreferences({ theme: "system", date_format: "iso" }))
      })

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })
      // The write wins for its own key, and only for its own key: everything
      // the reader did not touch still comes from the reply.
      expect(screen.getByTestId("theme")).toHaveTextContent("dark")
      expect(screen.getByTestId("date-format")).toHaveTextContent("iso")
    })

    it("still lets the server win when a failed write refetches", async () => {
      // The reload here is issued after the write, not before it, so the
      // guard must not protect the value that just failed to save.
      mockApiUpdate.mockRejectedValue(new Error("Update failed"))
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
      mockApiGet.mockResolvedValue(mockPreferences({ theme: "system" }))

      renderProvider()
      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      act(() => {
        screen.getByTestId("update-single").click()
      })

      await waitFor(() => {
        expect(mockApiGet).toHaveBeenCalledTimes(2)
      })
      await waitFor(() => {
        expect(screen.getByTestId("theme")).toHaveTextContent("system")
      })

      consoleSpy.mockRestore()
    })
  })

  describe("usePreferences hook", () => {
    it("throws error when used outside Provider", () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow("usePreferences must be used within a PreferencesProvider")

      consoleSpy.mockRestore()
    })

    it("returns context value when inside Provider", async () => {
      renderProvider()

      await waitFor(() => {
        expect(screen.getByTestId("loading")).toHaveTextContent("loaded")
      })

      // If we got here, the hook returned successfully
      expect(screen.getByTestId("theme")).toBeInTheDocument()
    })
  })
})
