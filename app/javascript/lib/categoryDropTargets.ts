import { KeyboardCode, rectIntersection } from "@dnd-kit/core"
import type { ClientRect, CollisionDetection, KeyboardCoordinateGetter } from "@dnd-kit/core"

// A lifted row that has reached a target sits exactly on it; this keeps a
// sub-pixel drift from counting the same target as still ahead.
const SAME_ROW_PX = 1

/**
 * Where the arrows send a keyboard-lifted feed in the sidebar tree: up or down
 * to the nearest category whose top is above or below it, past feed rows,
 * which are not drop targets. The sortable list's getter does not fit, since
 * it moves between the dragged rows themselves.
 */
export const categoryKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (event.code === KeyboardCode.Left || event.code === KeyboardCode.Right) {
    event.preventDefault()
    return undefined
  }
  if (event.code !== KeyboardCode.Down && event.code !== KeyboardCode.Up) return undefined
  event.preventDefault()

  const { collisionRect, droppableRects, droppableContainers } = context
  if (!collisionRect) return undefined

  const down = event.code === KeyboardCode.Down
  let target: ClientRect | undefined
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id)
    if (!rect) continue
    const ahead = down
      ? rect.top > collisionRect.top + SAME_ROW_PX
      : rect.top < collisionRect.top - SAME_ROW_PX
    if (ahead && (!target || (down ? rect.top < target.top : rect.top > target.top))) {
      target = rect
    }
  }
  return target && { x: target.left, y: target.top }
}

/**
 * The sidebar's collision detection. A pointer drag keeps dnd-kit's default.
 * A keyboard drag, which has no pointer, is over the innermost category whose
 * box holds the lifted row's top left corner: a category's box also holds its
 * subcategories, so overlap alone would let a long parent outscore the child
 * the arrows just landed on.
 */
export const categoryCollisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) return rectIntersection(args)

  const { collisionRect, droppableRects, droppableContainers } = args
  const x = collisionRect.left + SAME_ROW_PX
  const y = collisionRect.top + SAME_ROW_PX
  let hit: { container: (typeof droppableContainers)[number]; top: number } | undefined
  for (const container of droppableContainers) {
    const rect = droppableRects.get(container.id)
    if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
    if (!hit || rect.top > hit.top) hit = { container, top: rect.top }
  }
  return hit ? [{ id: hit.container.id, data: { droppableContainer: hit.container, value: 1 } }] : []
}
