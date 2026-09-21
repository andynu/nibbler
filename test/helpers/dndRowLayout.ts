import { vi } from "vitest"

const px = (value: string) => parseFloat(value) || 0

/** The box of the nearest element, this one or an ancestor, placed by an inline top. */
function inlineBoxOf(element: HTMLElement) {
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    if (node.style.top) {
      return {
        top: px(node.style.top),
        left: px(node.style.left),
        width: px(node.style.width),
        height: px(node.style.height),
      }
    }
  }
  return { top: 0, left: 0, width: 0, height: 0 }
}

interface RowBox {
  width?: number
  height?: number
  pitch?: number
}

/**
 * Stacks the rows a dnd-kit list draws, so an arrow key has somewhere to move.
 *
 * happy-dom lays nothing out, so every row measures zero and the keyboard
 * sensor finds no neighbour. This gives each match of `selector` a box at its
 * place in document order. DragOverlay places a wrapper over the lifted row
 * with an inline box, and dnd-kit collides the rows against the overlay
 * measured inside it, so anything else reports the inline box it sits in.
 *
 * The spy is on the prototype, so a test that installs it restores mocks after.
 */
export function stackRows(selector: string, { width = 320, height = 36, pitch = 40 }: RowBox = {}) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement
  ) {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const index = rows.indexOf(this)
    const box =
      index === -1 ? inlineBoxOf(this) : { top: index * pitch, left: 0, width, height }
    return {
      x: box.left,
      y: box.top,
      top: box.top,
      left: box.left,
      right: box.left + box.width,
      bottom: box.top + box.height,
      width: box.width,
      height: box.height,
      toJSON: () => ({}),
    }
  })
}
