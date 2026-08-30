import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { PreferencesPanel } from "./PreferencesPanel"
import { PreferencesProvider } from "@/contexts/PreferencesContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { I18nProvider } from "@/contexts/I18nContext"
import { THEME_ATTRIBUTE } from "@/lib/themes"
import { mockPreferences } from "../../../test/fixtures/data"

/**
 * The theme picker, end to end.
 *
 * These tests drive the real control and then assert on the palette the document
 * is actually in, across a reload with the cache cleared. A test that only
 * checked the choice was written somewhere passes against every version of this
 * control, including the one that wrote it to localStorage and nowhere else
 * (ttrb-g18k); clearing the cache is what leaves the account as the only thing
 * that can carry the choice.
 *
 * The api mock keeps the last theme it was sent, so a second render is a
 * reload against the same account rather than a fixed response.
 */

let storedTheme: string
const mockApiPreferencesGet = vi.fn()
const mockApiPreferencesUpdate = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    preferences: {
      get: () => mockApiPreferencesGet(),
      update: (...args: unknown[]) => mockApiPreferencesUpdate(...args),
    },
  },
}))

vi.mock("@/lib/accentColors", () => ({
  applyAccentColors: vi.fn(),
  generateAccentColors: vi.fn(() => ({ primary: "#3b82f6" })),
  DEFAULT_ACCENT_HUE: 217,
}))

// The language picker's own wiring is covered against real i18next in
// PreferencesPanel.language.test.tsx; here it is only in the way.
vi.mock("@/lib/i18n", () => ({
  initI18n: vi.fn(),
  applyLanguage: vi.fn(),
  resolveLanguage: vi.fn(() => "en"),
  readStoredLanguage: vi.fn(() => undefined),
  storeLanguage: vi.fn(),
  isSupportedLanguage: vi.fn(() => false),
  SUPPORTED_LANGUAGES: [{ code: "en", name: "English" }],
  i18n: { language: "en" },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}))

const THEME_STORAGE_KEY = "nibbler-theme"

function renderPanel() {
  return render(
    <ThemeProvider>
      <I18nProvider>
        <PreferencesProvider>
          <PreferencesPanel />
        </PreferencesProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

const themeOption = (name: string) => screen.getByRole("radio", { name })

async function pickTheme(user: ReturnType<typeof userEvent.setup>, name: string) {
  // The panel renders a loading message until the preferences request lands.
  await user.click(await screen.findByRole("radio", { name }))
}

const root = () => document.documentElement
const appliedTheme = () => root().getAttribute(THEME_ATTRIBUTE)

/** The theme updates the account was sent, in order. */
function themeWrites(): string[] {
  return mockApiPreferencesUpdate.mock.calls
    .map(([update]) => (update as { theme?: string }).theme)
    .filter((theme): theme is string => theme !== undefined)
}

describe("PreferencesPanel theme picker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    root().className = ""
    root().removeAttribute(THEME_ATTRIBUTE)

    storedTheme = "system"
    mockApiPreferencesGet.mockImplementation(() =>
      Promise.resolve(mockPreferences({ theme: storedTheme }))
    )
    mockApiPreferencesUpdate.mockImplementation((update: { theme?: string }) => {
      if (update.theme !== undefined) storedTheme = update.theme
      return Promise.resolve({})
    })
  })

  afterEach(() => {
    root().className = ""
    root().removeAttribute(THEME_ATTRIBUTE)
  })

  it("applies the chosen palette and stores the choice on the account", async () => {
    const user = userEvent.setup()
    renderPanel()

    await pickTheme(user, "Gruvbox Dark")

    expect(appliedTheme()).toBe("gruvbox-dark")
    expect(root().classList.contains("dark")).toBe(true)
    await waitFor(() => expect(themeWrites()).toEqual(["gruvbox-dark"]))
  })

  it("keeps the chosen palette across a reload with an empty cache", async () => {
    const user = userEvent.setup()
    const { unmount } = renderPanel()

    await pickTheme(user, "Gruvbox Dark")
    await waitFor(() => expect(themeWrites()).toEqual(["gruvbox-dark"]))

    // The cache is the only thing that made the localStorage-only picker look
    // like it worked within one browser. Clearing it leaves the account.
    unmount()
    localStorage.clear()
    root().className = ""
    root().removeAttribute(THEME_ATTRIBUTE)

    renderPanel()

    await waitFor(() => expect(appliedTheme()).toBe("gruvbox-dark"))
    expect(root().classList.contains("dark")).toBe(true)
    expect(themeOption("Gruvbox Dark")).toBeChecked()
  })

  it("starts in the palette the account holds, with nothing in localStorage", async () => {
    storedTheme = "sepia"

    renderPanel()

    await waitFor(() => expect(appliedTheme()).toBe("sepia"))
    expect(themeOption("Sepia")).toBeChecked()
    // Reading the account is not a reason to write to it.
    expect(themeWrites()).toEqual([])
  })

  it("adopts a palette that only localStorage has instead of resetting the reader", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "gruvbox-light")

    renderPanel()

    await waitFor(() => expect(themeWrites()).toEqual(["gruvbox-light"]))
    expect(appliedTheme()).toBe("gruvbox-light")
    expect(themeOption("Gruvbox Light")).toBeChecked()
  })

  it("does not bring back a palette the reader has moved away from", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark")
    const user = userEvent.setup()
    const { unmount } = renderPanel()

    await waitFor(() => expect(appliedTheme()).toBe("dark"))

    await pickTheme(user, "System")
    await waitFor(() => expect(storedTheme).toBe("system"))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system")

    unmount()
    mockApiPreferencesUpdate.mockClear()
    renderPanel()

    // The OS preference is light in these tests, so "system" lands on light.
    await waitFor(() => expect(appliedTheme()).toBe("light"))
    expect(root().classList.contains("dark")).toBe(false)
    expect(themeWrites()).toEqual([])
  })

  it("falls back to the system palette for a stored id this build does not know", async () => {
    storedTheme = "solarized"

    renderPanel()

    await waitFor(() => expect(appliedTheme()).toBe("light"))
    expect(themeOption("System")).toBeChecked()
    // A palette a newer build wrote is left where it is rather than overwritten.
    expect(themeWrites()).toEqual([])
    expect(storedTheme).toBe("solarized")
  })
})
