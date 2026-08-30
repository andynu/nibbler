import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ThemeProvider, useTheme } from "./ThemeContext"
import { DARK_MEDIA_QUERY, THEME_ATTRIBUTE } from "@/lib/themes"

const THEME_STORAGE_KEY = "nibbler-theme"

// setTheme stores the choice on the account, which is what makes it survive a
// browser that has never seen it. The end-to-end version of that, through the
// real picker and a reload, is PreferencesPanel.theme.test.tsx.
const mockApiPreferencesUpdate = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    preferences: {
      get: () => Promise.resolve({}),
      update: (...args: unknown[]) => mockApiPreferencesUpdate(...args),
    },
  },
}))

type MediaListener = () => void

// Controllable replacement for the blanket matchMedia stub in test/setup.ts, so
// a test can flip the OS preference the way a user changing their OS theme does.
function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches
  const listeners = new Set<MediaListener>()

  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: DARK_MEDIA_QUERY,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_event: string, listener: MediaListener) => {
      listeners.add(listener)
    },
    removeEventListener: (_event: string, listener: MediaListener) => {
      listeners.delete(listener)
    },
    dispatchEvent: () => false,
  }

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn(() => mediaQueryList),
  })

  return {
    setPrefersDark(next: boolean) {
      matches = next
      act(() => {
        listeners.forEach((listener) => listener())
      })
    },
    listenerCount: () => listeners.size,
  }
}

function TestConsumer() {
  const { theme, resolvedTheme, resolvedThemeId, setTheme, adoptServerTheme } = useTheme()

  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <div data-testid="resolved-theme">{resolvedTheme}</div>
      <div data-testid="resolved-theme-id">{resolvedThemeId}</div>
      <button data-testid="set-dark" onClick={() => setTheme("dark")}>
        dark
      </button>
      <button data-testid="set-light" onClick={() => setTheme("light")}>
        light
      </button>
      <button data-testid="set-system" onClick={() => setTheme("system")}>
        system
      </button>
      <button data-testid="adopt-sepia" onClick={() => adoptServerTheme("sepia")}>
        adopt sepia
      </button>
      <button data-testid="adopt-unknown" onClick={() => adoptServerTheme("solarized")}>
        adopt unknown
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <ThemeProvider>
      <TestConsumer />
    </ThemeProvider>
  )
}

function root() {
  return document.documentElement
}

describe("ThemeContext", () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    mockApiPreferencesUpdate.mockReset()
    mockApiPreferencesUpdate.mockResolvedValue({})
    root().className = ""
    root().removeAttribute(THEME_ATTRIBUTE)
  })

  afterEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: originalMatchMedia,
    })
    root().className = ""
    root().removeAttribute(THEME_ATTRIBUTE)
  })

  describe("with nothing stored", () => {
    it("defaults to system and applies the light palette when the OS is light", () => {
      installMatchMedia(false)
      renderProvider()

      expect(screen.getByTestId("theme")).toHaveTextContent("system")
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light")
      expect(screen.getByTestId("resolved-theme-id")).toHaveTextContent("light")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light")
      expect(root().classList.contains("dark")).toBe(false)
    })

    it("applies the dark palette when the OS prefers dark", () => {
      installMatchMedia(true)
      renderProvider()

      expect(screen.getByTestId("theme")).toHaveTextContent("system")
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(root().classList.contains("dark")).toBe(true)
    })
  })

  describe("following the OS preference", () => {
    it("switches palettes when the OS preference changes", () => {
      const media = installMatchMedia(false)
      renderProvider()

      expect(root().classList.contains("dark")).toBe(false)

      media.setPrefersDark(true)

      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(root().classList.contains("dark")).toBe(true)

      media.setPrefersDark(false)

      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light")
      expect(root().classList.contains("dark")).toBe(false)
    })

    it("ignores OS changes once a theme is pinned", async () => {
      const user = userEvent.setup()
      const media = installMatchMedia(false)
      renderProvider()

      await user.click(screen.getByTestId("set-light"))
      media.setPrefersDark(true)

      expect(screen.getByTestId("resolved-theme-id")).toHaveTextContent("light")
      expect(root().classList.contains("dark")).toBe(false)
    })

    it("removes the media listener on unmount", () => {
      const media = installMatchMedia(false)
      const { unmount } = renderProvider()

      expect(media.listenerCount()).toBe(1)
      unmount()
      expect(media.listenerCount()).toBe(0)
    })
  })

  describe("stored selections", () => {
    it("restores a stored theme id and pins it against the OS preference", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark")
      installMatchMedia(false)
      renderProvider()

      expect(screen.getByTestId("theme")).toHaveTextContent("dark")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(root().classList.contains("dark")).toBe(true)
    })

    it("falls back to system for a stored id that is no longer a theme", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "not-a-theme")
      installMatchMedia(true)
      renderProvider()

      expect(screen.getByTestId("theme")).toHaveTextContent("system")
      expect(screen.getByTestId("resolved-theme-id")).toHaveTextContent("dark")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
    })

    it("renders the light palette for an unknown stored id under a light OS", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "also-not-a-theme")
      installMatchMedia(false)
      renderProvider()

      expect(screen.getByTestId("resolved-theme-id")).toHaveTextContent("light")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light")
      expect(root().classList.contains("dark")).toBe(false)
    })
  })

  describe("setTheme", () => {
    it("swaps the applied palette and persists the choice", async () => {
      const user = userEvent.setup()
      installMatchMedia(false)
      renderProvider()

      await user.click(screen.getByTestId("set-dark"))

      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(root().classList.contains("dark")).toBe(true)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark")
      expect(mockApiPreferencesUpdate).toHaveBeenCalledWith({ theme: "dark" })

      await user.click(screen.getByTestId("set-light"))

      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light")
      expect(root().classList.contains("dark")).toBe(false)
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light")
      expect(mockApiPreferencesUpdate).toHaveBeenCalledWith({ theme: "light" })
    })

    it("hands control back to the OS when set to system", async () => {
      const user = userEvent.setup()
      const media = installMatchMedia(true)
      localStorage.setItem(THEME_STORAGE_KEY, "light")
      renderProvider()

      expect(root().classList.contains("dark")).toBe(false)

      await user.click(screen.getByTestId("set-system"))

      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(root().classList.contains("dark")).toBe(true)

      media.setPrefersDark(false)
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("light")
    })
  })

  describe("adoptServerTheme", () => {
    it("applies the account's palette and refreshes the cache without writing back", async () => {
      const user = userEvent.setup()
      installMatchMedia(false)
      localStorage.setItem(THEME_STORAGE_KEY, "dark")
      renderProvider()

      await user.click(screen.getByTestId("adopt-sepia"))

      expect(screen.getByTestId("theme")).toHaveTextContent("sepia")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("sepia")
      // A stale cache would be adopted as a preference on the next load.
      expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("sepia")
      expect(mockApiPreferencesUpdate).not.toHaveBeenCalled()
    })

    it("resolves an id this build does not know through the OS preference", async () => {
      const user = userEvent.setup()
      installMatchMedia(true)
      renderProvider()

      await user.click(screen.getByTestId("adopt-unknown"))

      expect(screen.getByTestId("theme")).toHaveTextContent("system")
      expect(root().getAttribute(THEME_ATTRIBUTE)).toBe("dark")
      expect(mockApiPreferencesUpdate).not.toHaveBeenCalled()
    })
  })

  it("throws when useTheme is used outside a provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => render(<TestConsumer />)).toThrow(
      "useTheme must be used within a ThemeProvider"
    )

    consoleError.mockRestore()
  })
})
