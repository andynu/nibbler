import { render, screen, waitFor, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { I18nProvider, useI18n } from "./I18nContext"
import { PreferencesProvider } from "./PreferencesContext"
import { mockPreferences } from "../../../test/fixtures/data"

// Mock API
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

// Mock i18n module
const mockInitI18n = vi.fn()
const mockChangeLanguage = vi.fn()

vi.mock("@/lib/i18n", () => ({
  initI18n: (...args: unknown[]) => mockInitI18n(...args),
  changeLanguage: (...args: unknown[]) => mockChangeLanguage(...args),
  SUPPORTED_LANGUAGES: [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
  ],
  i18n: { language: "en" },
}))

// Mock react-i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}))

// Test component that consumes I18nContext
function TestConsumer() {
  const { currentLanguage, supportedLanguages, isInitialized } = useI18n()
  return (
    <div>
      <span data-testid="current-language">{currentLanguage}</span>
      <span data-testid="initialized">{isInitialized ? "yes" : "no"}</span>
      <span data-testid="languages-count">{supportedLanguages.length}</span>
    </div>
  )
}

function renderWithProviders() {
  return render(
    <PreferencesProvider>
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>
    </PreferencesProvider>
  )
}

describe("I18nContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPreferencesGet.mockResolvedValue(mockPreferences())
    mockApiPreferencesUpdate.mockResolvedValue({})
    mockChangeLanguage.mockResolvedValue(undefined)
  })

  describe("initialization", () => {
    it("initializes i18n when preferences are loaded", async () => {
      renderWithProviders()

      await waitFor(() => {
        expect(mockInitI18n).toHaveBeenCalled()
      })
    })

    it("passes saved language to initI18n", async () => {
      mockApiPreferencesGet.mockResolvedValue({
        ...mockPreferences(),
        user_language: "es",
      })

      renderWithProviders()

      await waitFor(() => {
        expect(mockInitI18n).toHaveBeenCalledWith("es")
      })
    })

    it("passes undefined when no language is saved", async () => {
      mockApiPreferencesGet.mockResolvedValue({
        ...mockPreferences(),
        user_language: "",
      })

      renderWithProviders()

      await waitFor(() => {
        expect(mockInitI18n).toHaveBeenCalledWith(undefined)
      })
    })
  })

  describe("context values", () => {
    it("exposes supported languages", async () => {
      renderWithProviders()

      await waitFor(() => {
        expect(screen.getByTestId("languages-count")).toHaveTextContent("2")
      })
    })

    it("shows initialized state after initialization", async () => {
      renderWithProviders()

      await waitFor(() => {
        expect(screen.getByTestId("initialized")).toHaveTextContent("yes")
      })
    })

    it("exposes current language", async () => {
      renderWithProviders()

      await waitFor(() => {
        expect(screen.getByTestId("current-language")).toHaveTextContent("en")
      })
    })
  })

  describe("error handling", () => {
    it("throws error when used outside provider", () => {
      // Temporarily suppress console error for this test
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow("useI18n must be used within an I18nProvider")

      consoleSpy.mockRestore()
    })
  })
})
