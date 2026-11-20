/**
 * Dispatches a keydown on the body, away from any control, and reports
 * whether a document listener prevented its default. A keyboard drag's sensor
 * still listening after its DndContext is gone is what prevents it.
 */
export function bodyKeydownIsPrevented(key: string): boolean {
  const code = key === " " ? "Space" : key
  const event = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  return event.defaultPrevented
}

/** The keys a lifted row's sensor answers, each checked on its own. */
export const STRAY_DRAG_KEYS = ["ArrowDown", "ArrowUp", " ", "Enter", "Tab", "Escape"]

/** The keys among STRAY_DRAG_KEYS whose default a document listener prevented. */
export function preventedStrayDragKeys(): string[] {
  return STRAY_DRAG_KEYS.filter((key) => bodyKeydownIsPrevented(key))
}
