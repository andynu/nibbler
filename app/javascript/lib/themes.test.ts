import { describe, it, expect, beforeEach } from "vitest"
import {
  DEFAULT_SYSTEM_THEMES,
  SYSTEM_THEME,
  THEMES,
  THEME_ATTRIBUTE,
  ThemeDefinition,
  applyTheme,
  getTheme,
  isThemeId,
  isThemeSelection,
  normalizeThemeSelection,
  resolveTheme,
} from "./themes"

describe("themes registry", () => {
  it("registers light and dark with matching bases", () => {
    expect(getTheme("light")).toMatchObject({ id: "light", base: "light" })
    expect(getTheme("dark")).toMatchObject({ id: "dark", base: "dark" })
  })

  it("gives every theme a unique id and a display name", () => {
    const ids = THEMES.map((theme) => theme.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const theme of THEMES) {
      expect(theme.name.length).toBeGreaterThan(0)
    }
  })

  it("resolves the default system pair to registered themes", () => {
    expect(getTheme(DEFAULT_SYSTEM_THEMES.light)).toBeDefined()
    expect(getTheme(DEFAULT_SYSTEM_THEMES.dark)).toBeDefined()
  })

  it("returns undefined for an unregistered id", () => {
    expect(getTheme("gruvbox")).toBeUndefined()
    expect(getTheme(null)).toBeUndefined()
    expect(getTheme(undefined)).toBeUndefined()
  })
})

describe("isThemeId / isThemeSelection", () => {
  it("accepts registered ids", () => {
    expect(isThemeId("dark")).toBe(true)
    expect(isThemeId("light")).toBe(true)
  })

  it("rejects unknown ids and non-strings", () => {
    expect(isThemeId("gruvbox")).toBe(false)
    expect(isThemeId(SYSTEM_THEME)).toBe(false)
    expect(isThemeId(null)).toBe(false)
    expect(isThemeId(42)).toBe(false)
  })

  it("treats system as a valid selection but not a theme id", () => {
    expect(isThemeSelection(SYSTEM_THEME)).toBe(true)
    expect(isThemeSelection("dark")).toBe(true)
    expect(isThemeSelection("gruvbox")).toBe(false)
  })
})

describe("normalizeThemeSelection", () => {
  it("passes registered ids and system through", () => {
    expect(normalizeThemeSelection("light")).toBe("light")
    expect(normalizeThemeSelection("dark")).toBe("dark")
    expect(normalizeThemeSelection(SYSTEM_THEME)).toBe(SYSTEM_THEME)
  })

  it("falls back to system for values that are no longer themes", () => {
    expect(normalizeThemeSelection("gruvbox")).toBe(SYSTEM_THEME)
    expect(normalizeThemeSelection("")).toBe(SYSTEM_THEME)
    expect(normalizeThemeSelection(null)).toBe(SYSTEM_THEME)
    expect(normalizeThemeSelection(undefined)).toBe(SYSTEM_THEME)
    expect(normalizeThemeSelection({ id: "dark" })).toBe(SYSTEM_THEME)
  })
})

describe("resolveTheme", () => {
  it("resolves a named theme to itself regardless of the OS preference", () => {
    expect(resolveTheme("light", true).id).toBe("light")
    expect(resolveTheme("light", false).id).toBe("light")
    expect(resolveTheme("dark", false).id).toBe("dark")
    expect(resolveTheme("dark", true).id).toBe("dark")
  })

  it("resolves system through the OS preference", () => {
    expect(resolveTheme(SYSTEM_THEME, false).id).toBe("light")
    expect(resolveTheme(SYSTEM_THEME, true).id).toBe("dark")
  })

  it("resolves an unknown id as if it were system", () => {
    expect(resolveTheme("gruvbox", false).id).toBe("light")
    expect(resolveTheme("gruvbox", true).id).toBe("dark")
    expect(resolveTheme(null, true).id).toBe("dark")
  })

  it("honours a custom system pair", () => {
    const pair = { light: "dark", dark: "light" } as const
    expect(resolveTheme(SYSTEM_THEME, false, pair).id).toBe("dark")
    expect(resolveTheme(SYSTEM_THEME, true, pair).id).toBe("light")
  })

  it("falls back to the defaults when the system pair names a missing theme", () => {
    const pair = { light: "sepia", dark: "gruvbox" } as unknown as typeof DEFAULT_SYSTEM_THEMES
    expect(resolveTheme(SYSTEM_THEME, false, pair).id).toBe(DEFAULT_SYSTEM_THEMES.light)
    expect(resolveTheme(SYSTEM_THEME, true, pair).id).toBe(DEFAULT_SYSTEM_THEMES.dark)
  })

  it("always returns a registered theme", () => {
    for (const selection of [SYSTEM_THEME, "light", "dark", "nope", ""]) {
      for (const prefersDark of [true, false]) {
        expect(THEMES).toContain(resolveTheme(selection, prefersDark))
      }
    }
  })
})

describe("applyTheme", () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.createElement("html")
  })

  it("names the palette with a data attribute", () => {
    applyTheme(root, getTheme("light")!)
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("light")

    applyTheme(root, getTheme("dark")!)
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("dark")
  })

  it("adds the dark class for dark themes and removes it for light ones", () => {
    applyTheme(root, getTheme("dark")!)
    expect(root.classList.contains("dark")).toBe(true)

    applyTheme(root, getTheme("light")!)
    expect(root.classList.contains("dark")).toBe(false)
  })

  it("keeps the dark class when swapping between two dark palettes", () => {
    const gruvbox: ThemeDefinition = { id: "gruvbox", name: "Gruvbox", base: "dark" }

    applyTheme(root, getTheme("dark")!)
    applyTheme(root, gruvbox)

    expect(root.classList.contains("dark")).toBe(true)
    expect(root.getAttribute(THEME_ATTRIBUTE)).toBe("gruvbox")
  })

  it("leaves unrelated classes alone", () => {
    root.classList.add("js-enabled")

    applyTheme(root, getTheme("dark")!)
    applyTheme(root, getTheme("light")!)

    expect(root.classList.contains("js-enabled")).toBe(true)
  })
})
