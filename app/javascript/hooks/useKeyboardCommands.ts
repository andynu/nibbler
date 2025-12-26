import { useEffect, useCallback } from "react"

export interface KeyboardCommand {
  key: string
  handler: () => void
  description: string
  modifiers?: {
    ctrl?: boolean
    shift?: boolean
    alt?: boolean
    meta?: boolean
  }
}

function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    element.isContentEditable
  )
}

function matchesModifiers(
  event: KeyboardEvent,
  modifiers?: KeyboardCommand["modifiers"]
): boolean {
  const expected = modifiers || {}
  return (
    !!event.ctrlKey === !!expected.ctrl &&
    !!event.shiftKey === !!expected.shift &&
    !!event.altKey === !!expected.alt &&
    !!event.metaKey === !!expected.meta
  )
}

export function useKeyboardCommands(
  commands: KeyboardCommand[],
  enabled: boolean = true
): void {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return
      if (isInputElement(event.target)) return

      for (const command of commands) {
        if (event.key === command.key && matchesModifiers(event, command.modifiers)) {
          event.preventDefault()
          command.handler()
          return
        }
      }
    },
    [commands, enabled]
  )

  useEffect(() => {
    if (!enabled) return

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [handleKeyDown, enabled])
}
