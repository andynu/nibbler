import { useKeyboardCommands } from "@/hooks/useKeyboardCommands"

/**
 * The page's shortcuts on the keys a keyboard drag uses, plus one it does not.
 */
export const SHORTCUT_KEYS = [" ", "Enter", "Escape", "ArrowDown", "x"]

/**
 * Stands in for the page's keyboard commands in a suite checking that a
 * control's own keys stay out of them.
 *
 * Render it before the component under test, so its document listener is
 * registered ahead of the one dnd-kit adds on pickup, the same order the app
 * has.
 */
export function PageShortcuts({ onKey }: { onKey: (key: string) => void }) {
  useKeyboardCommands(
    SHORTCUT_KEYS.map((key) => ({ key, description: key, handler: () => onKey(key) }))
  )
  return null
}
