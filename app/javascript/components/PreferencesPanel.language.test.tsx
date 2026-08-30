import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { useTranslation } from "react-i18next"
import { PreferencesPanel } from "./PreferencesPanel"
import { PreferencesProvider } from "@/contexts/PreferencesContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { I18nProvider } from "@/contexts/I18nContext"
import { initI18n, i18n } from "@/lib/i18n"
import { mockPreferences } from "../../../test/fixtures/data"

/**
 * The language picker, end to end.
 *
 * These tests drive the real Select and then assert on what the interface
 * renders, not on what was written somewhere. A test that only checked the
 * preference was stored passes against a picker whose choice never reaches
 * i18next, and a test that only checked i18next passes against a picker whose
 * choice never reaches the server; this file is the family of dead-control bugs
 * (ttrb-bbjz, ttrb-nhp6, ttrb-qmwo) that those two tests each miss.
 *
 * i18next, react-i18next, @/lib/i18n and both contexts are real here. The one
 * substitution is the language catalog: the app bundles a single locale, so
 * every language resolves to English and no wiring is observable. A second
 * language makes the rendered output move.
 */

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

vi.mock("@/lib/i18n/languages", () => {
  const SUPPORTED_LANGUAGES = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
  ] as const
  return {
    SUPPORTED_LANGUAGES,
    isSupportedLanguage: (code?: string | null) =>
      !!code && SUPPORTED_LANGUAGES.some((language) => language.code === code),
  }
})

// Any translated string will do; common.save is real and short.
const ENGLISH = "Save"
const SPANISH = "Guardar"

function TranslationProbe() {
  const { t } = useTranslation()
  return <span data-testid="probe">{t("common.save")}</span>
}

function renderPanel() {
  // Nested as application.tsx nests them: ThemeProvider paints the login form
  // too, so it is above the provider that loads preferences, not below it.
  return render(
    <ThemeProvider>
      <I18nProvider>
        <PreferencesProvider>
          <TranslationProbe />
          <PreferencesPanel />
        </PreferencesProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

const languageSelect = () => screen.getByRole("combobox", { name: "Language" })

async function pickLanguage(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(languageSelect())
  await user.click(await screen.findByRole("option", { name: label }))
}

describe("PreferencesPanel language picker", () => {
  beforeAll(() => {
    // Initialise before the first render so the Spanish bundle has a resource
    // store to go into. I18nProvider's own initI18n call is idempotent.
    initI18n()
    i18n.addResourceBundle("es", "translation", { common: { save: SPANISH } })
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockApiPreferencesGet.mockResolvedValue(mockPreferences())
    mockApiPreferencesUpdate.mockResolvedValue({})
  })

  it("puts the interface in the chosen language and stores the choice on the server", async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(await screen.findByTestId("probe")).toHaveTextContent(ENGLISH)

    await pickLanguage(user, "Español")

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(SPANISH))
    expect(mockApiPreferencesUpdate).toHaveBeenCalledWith({ user_language: "es" })
  })

  it("starts in the language the server has stored, with nothing in localStorage", async () => {
    mockApiPreferencesGet.mockResolvedValue(mockPreferences({ user_language: "es" }))

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(SPANISH))
    expect(languageSelect()).toHaveTextContent("Español")
  })

  it("returns the interface to the browser default when Browser default is picked", async () => {
    mockApiPreferencesGet.mockResolvedValue(mockPreferences({ user_language: "es" }))
    const user = userEvent.setup()
    renderPanel()

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(SPANISH))

    await pickLanguage(user, "Browser default")

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(ENGLISH))
    expect(mockApiPreferencesUpdate).toHaveBeenCalledWith({ user_language: "" })
    // Left behind, this would put the reader back into Spanish on the next load
    // and would be adopted as a server preference by the test below.
    expect(localStorage.getItem("nibbler-language")).toBeNull()
  })

  it("adopts a language that only localStorage has instead of resetting the reader", async () => {
    localStorage.setItem("nibbler-language", "es")
    mockApiPreferencesGet.mockResolvedValue(mockPreferences({ user_language: "" }))

    renderPanel()

    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent(SPANISH))
    await waitFor(() =>
      expect(mockApiPreferencesUpdate).toHaveBeenCalledWith({ user_language: "es" })
    )
    expect(languageSelect()).toHaveTextContent("Español")
  })
})
