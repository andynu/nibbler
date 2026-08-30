import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ThemePicker } from "./ThemePicker"
import {
  DEFAULT_SYSTEM_THEMES,
  SYSTEM_THEME,
  THEMES,
  THEME_ATTRIBUTE,
  type ThemeSelection,
} from "@/lib/themes"

/**
 * The picker's own contract: it offers what the registry holds, previews each
 * palette in that palette's colours, and reports the choice through setTheme.
 *
 * Persistence is deliberately out of scope here -- it lives under setTheme in
 * ThemeContext and is covered against the real provider in
 * PreferencesPanel.theme.test.tsx. Mocking the context is also how this file
 * catches the control reaching around it: a version that wrote localStorage or
 * called the preferences API directly would leave setTheme uncalled.
 */

const setTheme = vi.fn()
let selection: ThemeSelection

vi.mock("@/contexts/ThemeContext", () => ({
  useTheme: () => ({
    theme: selection,
    setTheme: (value: ThemeSelection) => setTheme(value),
  }),
}))

/** The element a card's swatch scopes its palette to, if it has one. */
function swatchPalettes(name: string): string[] {
  const label = screen.getByRole("radio", { name }).closest("label")
  return Array.from(label?.querySelectorAll(`[${THEME_ATTRIBUTE}]`) ?? []).map(
    (element) => element.getAttribute(THEME_ATTRIBUTE) ?? ""
  )
}

describe("ThemePicker", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    selection = SYSTEM_THEME
  })

  it("offers every registered theme plus system, and nothing else", () => {
    render(<ThemePicker />)

    // Grouping by base reorders the cards, so the set is what matters here.
    const values = screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))
    expect(values).toHaveLength(THEMES.length + 1)
    expect(values.slice().sort()).toEqual(
      [SYSTEM_THEME, ...THEMES.map((theme) => theme.id)].sort()
    )
    // System comes first: it is what an account with no theme is already on.
    expect(values[0]).toBe(SYSTEM_THEME)
  })

  it("names each option after the registry entry it selects", () => {
    render(<ThemePicker />)

    for (const theme of THEMES) {
      expect(screen.getByRole("radio", { name: theme.name })).toHaveAttribute("value", theme.id)
    }
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("value", SYSTEM_THEME)
  })

  it("groups the themes by base", () => {
    render(<ThemePicker />)

    for (const [label, base] of [
      ["Light themes", "light"],
      ["Dark themes", "dark"],
    ] as const) {
      const group = screen.getByRole("group", { name: label })
      const expected = THEMES.filter((theme) => theme.base === base).map((theme) => theme.name)
      expect(within(group).getAllByRole("radio").map((radio) => radio.getAttribute("value")))
        .toEqual(THEMES.filter((theme) => theme.base === base).map((theme) => theme.id))
      for (const name of expected) {
        expect(within(group).getByRole("radio", { name })).toBeInTheDocument()
      }
    }
  })

  // The swatches carry no colour values of their own: each one sets data-theme
  // to the palette it advertises and paints with the semantic utilities, so the
  // stylesheet decides what it looks like. A swatch pointed at the wrong
  // palette is the only way this can lie, and that is what is asserted.
  it("scopes each swatch to the palette its option selects", () => {
    render(<ThemePicker />)

    for (const theme of THEMES) {
      expect(swatchPalettes(theme.name)).toEqual([theme.id])
    }
  })

  it("previews system as the two palettes it switches between", () => {
    render(<ThemePicker />)

    expect(swatchPalettes("System")).toEqual([
      DEFAULT_SYSTEM_THEMES.light,
      DEFAULT_SYSTEM_THEMES.dark,
    ])
  })

  it("marks dark palettes so their swatches get the dark-only rules", () => {
    render(<ThemePicker />)

    for (const theme of THEMES) {
      const face = screen
        .getByRole("radio", { name: theme.name })
        .closest("label")
        ?.querySelector(`[${THEME_ATTRIBUTE}="${theme.id}"]`)
      expect(face?.classList.contains("dark"), theme.id).toBe(theme.base === "dark")
    }
  })

  it("reports the choice through setTheme", async () => {
    const user = userEvent.setup()
    render(<ThemePicker />)

    await user.click(screen.getByRole("radio", { name: "Gruvbox Dark" }))

    expect(setTheme).toHaveBeenCalledExactlyOnceWith("gruvbox-dark")
  })

  it("shows the stored selection as the checked option", () => {
    selection = "sepia"
    render(<ThemePicker />)

    expect(screen.getByRole("radio", { name: "Sepia" })).toBeChecked()
    expect(screen.getByRole("radio", { name: "System" })).not.toBeChecked()
  })

  describe("accessibility", () => {
    it("gives the group and every option an accessible name", () => {
      render(<ThemePicker />)

      expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument()
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).toHaveAccessibleName()
      }
    })

    it("describes what system resolves to without putting it in the name", () => {
      render(<ThemePicker />)

      const system = screen.getByRole("radio", { name: "System" })
      expect(system).toHaveAccessibleName("System")
      expect(system).toHaveAccessibleDescription(/switches with your device setting/i)
    })

    // Two controls in this panel already shipped with a Label whose htmlFor
    // named an element that did not exist (ttrb-g18k, ttrb-qmwo). These labels
    // wrap their input instead, which is what makes the whole card clickable.
    it("leaves no label pointing at an element that is not there", () => {
      const { container } = render(<ThemePicker />)

      for (const label of Array.from(container.querySelectorAll("label[for]"))) {
        const target = label.getAttribute("for")!
        expect(document.getElementById(target), `label for="${target}"`).not.toBeNull()
      }
      // Every radio is reachable by clicking its card, because the label is its
      // ancestor rather than a sibling pointing at it by id.
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio.closest("label")).not.toBeNull()
      }
    })

    it("is reachable and operable from the keyboard", async () => {
      const user = userEvent.setup()
      render(<ThemePicker />)

      await user.tab()
      expect(screen.getByRole("radio", { name: "System" })).toHaveFocus()

      await user.keyboard("{ArrowDown}")

      expect(setTheme).toHaveBeenCalledExactlyOnceWith("light")
    })
  })
})
