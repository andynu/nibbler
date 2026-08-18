import { KeyboardCommand } from "@/hooks/useKeyboardCommands"

/**
 * Single source of truth for keyboard shortcuts.
 *
 * The help dialog renders this catalog and `buildKeyboardCommands` turns it into
 * the bindings passed to `useKeyboardCommands`, so a shortcut cannot be listed
 * without being bound (or explicitly marked as bound elsewhere) and cannot be
 * bound without showing up in the dialog.
 */

export type ShortcutSection = "Navigation" | "Actions" | "View" | "Other"

export const shortcutSections: ShortcutSection[] = [
  "Navigation",
  "Actions",
  "View",
  "Other",
]

export type ShortcutId =
  | "next-entry"
  | "previous-entry"
  | "next-category"
  | "previous-category"
  | "page-down-or-next"
  | "page-up-or-previous"
  | "page-down-content"
  | "page-up-content"
  | "go-all"
  | "go-fresh"
  | "go-starred"
  | "open-entry"
  | "toggle-read"
  | "toggle-starred"
  | "toggle-published"
  | "toggle-iframe"
  | "open-original"
  | "refresh"
  | "toggle-focus-mode"
  | "toggle-sidebar"
  | "command-palette"
  | "close-entry"
  | "show-shortcuts"

/**
 * Shortcuts whose listener lives outside the command table. They still appear in
 * the help dialog but `buildKeyboardCommands` never asks for a handler.
 */
export type ExternallyBoundShortcutId = "command-palette"

/** Shortcut ids that must be given a handler in the command table. */
export type BoundShortcutId = Exclude<ShortcutId, ExternallyBoundShortcutId>

export interface ShortcutBinding {
  key: string
  modifiers?: KeyboardCommand["modifiers"]
}

export interface ShortcutDefinition {
  id: ShortcutId
  section: ShortcutSection
  /**
   * Label shown in the help dialog. Explicit rather than derived from
   * `bindings` so aliases collapse into a single row ("j / n").
   */
  keys: string
  description: string
  /** Bindings registered through `useKeyboardCommands`. */
  bindings: ShortcutBinding[]
  /** Where the listener lives when `bindings` is empty. */
  boundElsewhere?: string
}

export const shortcutCatalog: ShortcutDefinition[] = [
  {
    id: "next-entry",
    section: "Navigation",
    keys: "j / n",
    description: "Next entry",
    bindings: [{ key: "j" }, { key: "n" }],
  },
  {
    id: "previous-entry",
    section: "Navigation",
    keys: "k",
    description: "Previous entry",
    bindings: [{ key: "k" }],
  },
  {
    id: "next-category",
    section: "Navigation",
    keys: "Shift+J",
    description: "Next category",
    bindings: [{ key: "J", modifiers: { shift: true } }],
  },
  {
    id: "previous-category",
    section: "Navigation",
    keys: "Shift+K",
    description: "Previous category",
    bindings: [{ key: "K", modifiers: { shift: true } }],
  },
  {
    id: "page-down-or-next",
    section: "Navigation",
    keys: "Space",
    description: "Page down, then next unread",
    bindings: [{ key: " " }],
  },
  {
    id: "page-up-or-previous",
    section: "Navigation",
    keys: "Shift+Space",
    description: "Page up, then previous entry",
    bindings: [{ key: " ", modifiers: { shift: true } }],
  },
  {
    id: "page-down-content",
    section: "Navigation",
    keys: "Ctrl+F",
    description: "Page down content",
    bindings: [{ key: "f", modifiers: { ctrl: true } }],
  },
  {
    id: "page-up-content",
    section: "Navigation",
    keys: "Ctrl+B",
    description: "Page up content",
    bindings: [{ key: "b", modifiers: { ctrl: true } }],
  },
  {
    id: "go-all",
    section: "Navigation",
    keys: "a",
    description: "Go to All feeds",
    bindings: [{ key: "a" }],
  },
  {
    id: "go-fresh",
    section: "Navigation",
    keys: "f",
    description: "Go to Fresh",
    bindings: [{ key: "f" }],
  },
  {
    id: "go-starred",
    section: "Navigation",
    keys: "Shift+S",
    description: "Go to Starred",
    bindings: [{ key: "S", modifiers: { shift: true } }],
  },
  {
    id: "open-entry",
    section: "Actions",
    keys: "o / Enter",
    description: "Open entry",
    bindings: [{ key: "o" }, { key: "Enter" }],
  },
  {
    id: "toggle-read",
    section: "Actions",
    keys: "m / u",
    description: "Toggle read/unread",
    bindings: [{ key: "m" }, { key: "u" }],
  },
  {
    id: "toggle-starred",
    section: "Actions",
    keys: "s",
    description: "Toggle starred",
    bindings: [{ key: "s" }],
  },
  {
    id: "toggle-published",
    section: "Actions",
    keys: "p",
    description: "Toggle published",
    bindings: [{ key: "p" }],
  },
  {
    id: "toggle-iframe",
    section: "Actions",
    keys: "i",
    description: "Toggle iframe/RSS view",
    bindings: [{ key: "i" }],
  },
  {
    id: "open-original",
    section: "Actions",
    keys: "v",
    description: "Open original link",
    bindings: [{ key: "v" }],
  },
  {
    id: "refresh",
    section: "Actions",
    keys: "r",
    description: "Refresh entries",
    bindings: [{ key: "r" }],
  },
  {
    id: "toggle-focus-mode",
    section: "View",
    keys: "Shift+F",
    description: "Toggle focus mode",
    bindings: [{ key: "F", modifiers: { shift: true } }],
  },
  {
    id: "toggle-sidebar",
    section: "View",
    keys: "b",
    description: "Toggle sidebar",
    bindings: [{ key: "b" }],
  },
  {
    id: "command-palette",
    section: "Other",
    keys: "Ctrl+K",
    description: "Open command palette",
    bindings: [],
    boundElsewhere: "useCommandPalette in components/CommandPalette.tsx",
  },
  {
    id: "close-entry",
    section: "Other",
    keys: "Escape",
    description: "Exit focus mode / Close entry",
    bindings: [{ key: "Escape" }],
  },
  {
    id: "show-shortcuts",
    section: "Other",
    keys: "?",
    description: "Show keyboard shortcuts",
    bindings: [{ key: "?", modifiers: { shift: true } }],
  },
]

/** The catalog grouped for display, in section order, skipping empty sections. */
export function shortcutsBySection(): {
  section: ShortcutSection
  items: ShortcutDefinition[]
}[] {
  return shortcutSections
    .map((section) => ({
      section,
      items: shortcutCatalog.filter((shortcut) => shortcut.section === section),
    }))
    .filter((group) => group.items.length > 0)
}

/**
 * Expand the catalog into the flat command list `useKeyboardCommands` consumes.
 * Every alias becomes its own command; the handler map is exhaustive over
 * `BoundShortcutId`, so adding a shortcut to the catalog without wiring a
 * handler is a type error.
 */
export function buildKeyboardCommands(
  handlers: Record<BoundShortcutId, () => void>
): KeyboardCommand[] {
  return shortcutCatalog.flatMap((shortcut) => {
    const handler = handlers[shortcut.id as BoundShortcutId]
    if (!handler) return []

    return shortcut.bindings.map((binding) => ({
      key: binding.key,
      modifiers: binding.modifiers,
      handler,
      description: shortcut.description,
    }))
  })
}
