import { useMemo, useRef } from "react"
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from "@dnd-kit/core"
import type { Category, Feed } from "@/lib/api"

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To move a feed, press Space or Enter to pick it up. Use the up and down arrow keys to move it over a category, then press Space or Enter to drop it in. Press Escape to cancel.",
}

const UNCATEGORIZED = "Uncategorized"

export interface FeedDrop {
  feedId: number
  categoryId: number | null
}

const idAfter = (prefix: string, id: UniqueIdentifier) => parseInt(String(id).slice(prefix.length), 10)

/**
 * Where a drop on the tree puts the dragged feed: the category it landed on, or
 * the category holding the feed it landed on. A null category is Uncategorized.
 *
 * Null for a dragged category, because the tree persists no category order and
 * the drop leaves one where it was. The announcements below share this so they
 * cannot promise a move the drop does not make.
 */
export function feedDrop(
  activeId: UniqueIdentifier,
  overId: UniqueIdentifier,
  feeds: Feed[]
): FeedDrop | null {
  const active = String(activeId)
  const over = String(overId)
  if (!active.startsWith("feed-")) return null

  if (over.startsWith("category-")) {
    return { feedId: idAfter("feed-", active), categoryId: idAfter("category-", over) }
  }
  if (over.startsWith("feed-")) {
    const target = feeds.find((feed) => feed.id === idAfter("feed-", over))
    return { feedId: idAfter("feed-", active), categoryId: target?.category_id ?? null }
  }
  return { feedId: idAfter("feed-", active), categoryId: null }
}

/**
 * The feed tree's DndContext accessibility props. Announcements name a row by
 * its feed or category; dnd-kit's defaults read out the row id, which here is
 * a `feed-12` or `category-3` string.
 */
export function useFeedOrganizerDragAccessibility(feeds: Feed[], categories: Category[]) {
  const lastOverId = useRef<UniqueIdentifier | null>(null)

  return useMemo(() => {
    const categoryTitle = (id: number | null) =>
      (id === null ? undefined : categories.find((category) => category.id === id)?.title) ??
      UNCATEGORIZED

    const nameOf = (id: UniqueIdentifier) => {
      const key = String(id)
      if (key.startsWith("category-")) {
        return categories.find((category) => category.id === idAfter("category-", key))?.title
      }
      return feeds.find((feed) => feed.id === idAfter("feed-", key))?.title
    }

    const announcements: Announcements = {
      onDragStart({ active }) {
        lastOverId.current = active.id
        const name = nameOf(active.id)
        return name && `Picked up ${name}.`
      },
      // dnd-kit reports a lifted row over its own place straight after the
      // pickup, which would replace the pickup announcement before it is read.
      onDragOver({ active, over }) {
        const previousOverId = lastOverId.current
        lastOverId.current = over?.id ?? null
        if (!over || over.id === previousOverId) return undefined
        const name = nameOf(active.id)
        const target = nameOf(over.id)
        return name && target && `${name} is over ${target}.`
      },
      onDragEnd({ active, over }) {
        const name = nameOf(active.id)
        if (!name) return undefined
        if (!over || over.id === active.id) return `Dropped ${name}. Nothing moved.`

        const drop = feedDrop(active.id, over.id, feeds)
        if (!drop) return `Dropped ${name}. Nothing moved.`

        const destination = categoryTitle(drop.categoryId)
        const wasIn = feeds.find((feed) => feed.id === drop.feedId)?.category_id ?? null
        if (wasIn === drop.categoryId) return `${name} is already in ${destination}.`
        return `Moved ${name} to ${destination}.`
      },
      onDragCancel({ active }) {
        const name = nameOf(active.id)
        return name && `Move canceled. ${name} is back where it was.`
      },
    }

    return { announcements, screenReaderInstructions }
  }, [feeds, categories])
}
