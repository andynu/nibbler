import { useMemo, useRef } from "react"
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core"
import type { Category, Feed } from "@/lib/api"

// The sidebar's sensors are pointer only, so the grip is focusable but answers
// no key. Saying "press Space to pick it up", which is dnd-kit's default
// instruction, would send a screen reader user after a drag that never starts.
const screenReaderInstructions: ScreenReaderInstructions = {
  draggable: "Drag a feed onto a category to move it there. This list has no keyboard drag.",
}

/**
 * The sidebar tree's DndContext accessibility props. A feed is dragged onto a
 * category; announcements name both, where dnd-kit's defaults read out the feed
 * id and the `category-3` droppable id.
 */
export function useFeedSidebarDragAccessibility(feeds: Feed[], categories: Category[]) {
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  return useMemo(() => {
    const feedOf = (id: UniqueIdentifier) => feeds.find((feed) => feed.id === Number(id))
    const categoryIdOf = (id: UniqueIdentifier) => {
      const key = String(id)
      return key.startsWith("category-") ? parseInt(key.slice("category-".length), 10) : null
    }
    const categoryTitleOf = (id: UniqueIdentifier) => {
      const categoryId = categoryIdOf(id)
      return categoryId === null
        ? undefined
        : categories.find((category) => category.id === categoryId)?.title
    }

    const announcements: Announcements = {
      onDragStart({ active }) {
        lastOverId.current = active.id
        const feed = feedOf(active.id)
        return feed && `Picked up ${feed.title}.`
      },
      onDragOver({ active, over }) {
        const previousOverId = lastOverId.current
        lastOverId.current = over?.id ?? null
        if (!over || over.id === previousOverId) return undefined
        const feed = feedOf(active.id)
        const target = categoryTitleOf(over.id)
        return feed && target && `${feed.title} is over ${target}.`
      },
      onDragEnd({ active, over }) {
        const feed = feedOf(active.id)
        if (!feed) return undefined
        if (!over) return `Dropped ${feed.title}. Nothing moved.`

        const target = categoryTitleOf(over.id)
        if (!target) return `Dropped ${feed.title}. Nothing moved.`
        if (feed.category_id === categoryIdOf(over.id)) {
          return `${feed.title} is already in ${target}.`
        }
        return `Moved ${feed.title} to ${target}.`
      },
      onDragCancel({ active }) {
        const feed = feedOf(active.id)
        return feed && `Move canceled. ${feed.title} is back where it was.`
      },
    }

    return { announcements, screenReaderInstructions }
  }, [feeds, categories])
}
