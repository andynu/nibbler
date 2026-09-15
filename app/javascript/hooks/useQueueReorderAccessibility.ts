import { useMemo, useRef } from "react"
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core"
import type { QueueItem } from "@/lib/api"

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To move an item, press Space or Enter to pick it up. Use the up and down arrow keys to move it, then press Space or Enter to drop it. Press Escape to cancel.",
}

/**
 * The queue's DndContext accessibility props. Announcements name a row by its
 * article and its place in the queue; dnd-kit's defaults read out the row id.
 */
export function useQueueReorderAccessibility(queue: QueueItem[]) {
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  return useMemo(() => {
    const total = queue.length
    const placeOf = (id: UniqueIdentifier) => {
      const position = queue.findIndex((item) => item.id === id) + 1
      const item = queue[position - 1]
      return item && { title: item.entryTitle, position }
    }

    const announcements: Announcements = {
      onDragStart({ active }) {
        lastOverId.current = active.id
        const moved = placeOf(active.id)
        if (!moved) return undefined
        return `Picked up ${moved.title} at position ${moved.position} of ${total}.`
      },
      // dnd-kit reports a lifted row over its own place straight after the
      // pickup, which would replace the pickup announcement before it is read.
      onDragOver({ active, over }) {
        const previousOverId = lastOverId.current
        lastOverId.current = over?.id ?? null
        if (!over || over.id === previousOverId) return undefined
        const moved = placeOf(active.id)
        const target = placeOf(over.id)
        if (!moved || !target) return undefined
        return `${moved.title} moved to position ${target.position} of ${total}.`
      },
      onDragEnd({ active, over }) {
        const moved = placeOf(active.id)
        const target = placeOf((over ?? active).id)
        if (!moved || !target) return undefined
        return `Dropped ${moved.title} at position ${target.position} of ${total}.`
      },
      onDragCancel({ active }) {
        const moved = placeOf(active.id)
        if (!moved) return undefined
        return `Move canceled. ${moved.title} is back at position ${moved.position} of ${total}.`
      },
    }

    return { announcements, screenReaderInstructions }
  }, [queue])
}
