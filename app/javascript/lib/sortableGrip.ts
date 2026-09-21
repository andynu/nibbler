import { KeyboardCode } from "@dnd-kit/core"
import type { useSortable } from "@dnd-kit/sortable"
import type { KeyboardEvent } from "react"
import { withholdFromKeyboardCommands } from "@/hooks/useKeyboardCommands"

type SortableListeners = ReturnType<typeof useSortable>["listeners"]

// What the keyboard sensor answers while a row is lifted: Space, Enter and Tab
// put it down, Escape puts it back, the arrows move it.
const LIFTED_ROW_KEY_CODES: ReadonlySet<string> = new Set([
  KeyboardCode.Space,
  KeyboardCode.Enter,
  KeyboardCode.Tab,
  KeyboardCode.Esc,
  KeyboardCode.Up,
  KeyboardCode.Down,
  KeyboardCode.Left,
  KeyboardCode.Right,
])

/**
 * The keydown handler for a dnd-kit drag handle, which keeps the presses of a
 * keyboard drag out of the shortcut listeners on the document.
 *
 * A pickup is the press dnd-kit's activator prevents. The presses of a lifted
 * row are read by a document listener dnd-kit adds on pickup, which runs after
 * the shortcut listeners, so they are withheld rather than stopped; stopping
 * propagation would starve that listener as well.
 *
 * Every other press still reaches the shortcuts, including Escape on a handle
 * whose row is not lifted.
 *
 * Goes after dnd-kit's own listeners, which this calls itself:
 *
 *     <button {...attributes} {...listeners}
 *             onKeyDown={sortableGripKeyDown(listeners, isDragging)} />
 */
export function sortableGripKeyDown(
  listeners: SortableListeners,
  isDragging: boolean
): (event: KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    listeners?.onKeyDown?.(event)
    if (isDragging ? LIFTED_ROW_KEY_CODES.has(event.code) : event.defaultPrevented) {
      withholdFromKeyboardCommands(event.nativeEvent)
    }
  }
}
