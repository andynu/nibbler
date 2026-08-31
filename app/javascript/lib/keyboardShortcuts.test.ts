import { describe, it, expect, vi } from "vitest"
import {
  BoundShortcutId,
  buildKeyboardCommands,
  shortcutCatalog,
  shortcutSections,
  shortcutsBySection,
} from "./keyboardShortcuts"

function noopHandlers(): Record<BoundShortcutId, () => void> {
  const handlers = {} as Record<BoundShortcutId, () => void>
  for (const shortcut of shortcutCatalog) {
    if (shortcut.bindings.length === 0) continue
    handlers[shortcut.id as BoundShortcutId] = vi.fn()
  }
  return handlers
}

function bindingSignature(key: string, modifiers?: Record<string, boolean | undefined>) {
  const flags = ["ctrl", "shift", "alt", "meta"]
    .filter((name) => modifiers?.[name])
    .join("+")
  return flags ? `${flags}+${key}` : key
}

describe("shortcutCatalog", () => {
  it("has a unique id per entry", () => {
    const ids = shortcutCatalog.map((shortcut) => shortcut.id)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it("places every entry in a known section", () => {
    for (const shortcut of shortcutCatalog) {
      expect(shortcutSections).toContain(shortcut.section)
    }
  })

  it("never binds the same key and modifier combination twice", () => {
    const signatures = shortcutCatalog.flatMap((shortcut) =>
      shortcut.bindings.map((binding) => bindingSignature(binding.key, binding.modifiers))
    )

    expect(new Set(signatures).size).toBe(signatures.length)
  })

  it("documents where unbound shortcuts are actually bound", () => {
    const unbound = shortcutCatalog.filter((shortcut) => shortcut.bindings.length === 0)

    expect(unbound.length).toBeGreaterThan(0)
    for (const shortcut of unbound) {
      expect(shortcut.boundElsewhere).toBeTruthy()
    }
  })

  it("puts search on / and leaves Ctrl+F on the content pager", () => {
    const search = shortcutCatalog.find((shortcut) => shortcut.id === "focus-search")

    expect(search?.bindings).toEqual([{ key: "/" }])

    const ctrlF = shortcutCatalog.find((shortcut) =>
      shortcut.bindings.some((binding) => binding.key === "f" && binding.modifiers?.ctrl)
    )
    expect(ctrlF?.id).toBe("page-down-content")
  })

  // c, on the mnemonic. The catalog's lineage is Google Reader and tt-rss
  // (m/u, s, o, v, r), not vi, so there is no established yank key to defer to.
  it("copies the article link on a bare c", () => {
    const copyLink = shortcutCatalog.find((shortcut) => shortcut.id === "copy-link")

    expect(copyLink?.section).toBe("Actions")
    expect(copyLink?.bindings).toEqual([{ key: "c" }])
  })

  it("gives every entry a display label and description", () => {
    for (const shortcut of shortcutCatalog) {
      expect(shortcut.keys).not.toBe("")
      expect(shortcut.description).not.toBe("")
    }
  })
})

describe("shortcutsBySection", () => {
  it("groups the catalog in section order without losing entries", () => {
    const groups = shortcutsBySection()

    const grouped = groups.flatMap((group) => group.items)
    expect(grouped).toHaveLength(shortcutCatalog.length)

    const order = groups.map((group) => group.section)
    expect(order).toEqual(shortcutSections.filter((section) => order.includes(section)))
  })

  it("keeps every item under its own section", () => {
    for (const group of shortcutsBySection()) {
      for (const item of group.items) {
        expect(item.section).toBe(group.section)
      }
    }
  })
})

describe("buildKeyboardCommands", () => {
  it("emits one command per binding, aliases included", () => {
    const commands = buildKeyboardCommands(noopHandlers())

    const expectedCount = shortcutCatalog.reduce(
      (total, shortcut) => total + shortcut.bindings.length,
      0
    )
    expect(commands).toHaveLength(expectedCount)
  })

  it("carries the catalog description onto each command", () => {
    const commands = buildKeyboardCommands(noopHandlers())

    const nextEntry = commands.filter((command) => command.description === "Next entry")
    expect(nextEntry.map((command) => command.key).sort()).toEqual(["j", "n"])
  })

  it("routes every alias of a shortcut to the same handler", () => {
    const handlers = noopHandlers()
    const commands = buildKeyboardCommands(handlers)

    const openEntry = commands.filter((command) => command.description === "Open entry")
    expect(openEntry).toHaveLength(2)
    for (const command of openEntry) {
      command.handler()
    }
    expect(handlers["open-entry"]).toHaveBeenCalledTimes(2)
  })

  it("preserves modifiers", () => {
    const commands = buildKeyboardCommands(noopHandlers())

    const nextCategory = commands.find((command) => command.description === "Next category")
    expect(nextCategory).toEqual(
      expect.objectContaining({ key: "J", modifiers: { shift: true } })
    )
  })

  it("omits shortcuts that are bound elsewhere", () => {
    const commands = buildKeyboardCommands(noopHandlers())

    expect(
      commands.some((command) => command.description === "Open command palette")
    ).toBe(false)
  })
})
