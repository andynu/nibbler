import { describe, it, expect } from "vitest"
import type { ClientRect, CollisionDetection, KeyboardCoordinateGetter } from "@dnd-kit/core"
import { categoryCollisionDetection, categoryKeyboardCoordinates } from "./categoryDropTargets"

type CollisionArgs = Parameters<CollisionDetection>[0]
type GetterArgs = Parameters<KeyboardCoordinateGetter>[1]

const box = (top: number, height: number): ClientRect => ({
  top,
  left: 0,
  width: 240,
  height,
  right: 240,
  bottom: top + height,
})

// Tech holds its subcategory Rust and a long run of feeds below it, so Tech's
// box is much taller than Rust's and contains it. News follows.
const rects = new Map<string, ClientRect>([
  ["category-1", box(0, 1000)],
  ["category-2", box(32, 96)],
  ["category-3", box(1000, 64)],
])
const containers = [...rects.keys()].map((id) => ({ id, disabled: false }))

function collide(collisionRect: ClientRect, pointerCoordinates: CollisionArgs["pointerCoordinates"] = null) {
  return categoryCollisionDetection({
    active: { id: 7 },
    collisionRect,
    droppableRects: rects,
    droppableContainers: containers,
    pointerCoordinates,
  } as unknown as CollisionArgs).map((collision) => collision.id)
}

function press(code: string, collisionRect: ClientRect) {
  const event = new KeyboardEvent("keydown", { code, cancelable: true })
  const coordinates = categoryKeyboardCoordinates(event, {
    active: 7,
    currentCoordinates: { x: collisionRect.left, y: collisionRect.top },
    context: {
      collisionRect,
      droppableRects: rects,
      droppableContainers: { getEnabled: () => containers },
    },
  } as unknown as GetterArgs)
  return { coordinates, prevented: event.defaultPrevented }
}

describe("categoryCollisionDetection", () => {
  it("puts a keyboard drag over the innermost category holding its top left corner", () => {
    expect(collide(box(32, 36))).toEqual(["category-2"])
  })

  it("puts a keyboard drag over the parent once it is past the subcategory", () => {
    expect(collide(box(200, 36))).toEqual(["category-1"])
  })

  it("puts a keyboard drag over nothing outside every category", () => {
    expect(collide(box(2000, 36))).toEqual([])
  })

  it("leaves a pointer drag to dnd-kit's overlap ranking", () => {
    // The corner is still inside Tech, but most of the row overlaps News.
    expect(collide(box(990, 36))).toEqual(["category-1"])
    expect(collide(box(990, 36), { x: 10, y: 1000 })[0]).toBe("category-3")
  })
})

describe("categoryKeyboardCoordinates", () => {
  it("moves down to the nearest category below, skipping rows that are not targets", () => {
    expect(press("ArrowDown", box(300, 36))).toEqual({
      coordinates: { x: 0, y: 1000 },
      prevented: true,
    })
  })

  it("moves up to the nearest category above", () => {
    expect(press("ArrowUp", box(300, 36))).toEqual({
      coordinates: { x: 0, y: 32 },
      prevented: true,
    })
  })

  it("does not count the category it already sits on as ahead", () => {
    expect(press("ArrowDown", box(32, 36)).coordinates).toEqual({ x: 0, y: 1000 })
    expect(press("ArrowUp", box(32, 36)).coordinates).toEqual({ x: 0, y: 0 })
  })

  it("stays put past the last category", () => {
    expect(press("ArrowDown", box(1000, 36))).toEqual({ coordinates: undefined, prevented: true })
  })

  it("takes left and right without moving, since the tree has no columns", () => {
    expect(press("ArrowLeft", box(300, 36))).toEqual({ coordinates: undefined, prevented: true })
    expect(press("ArrowRight", box(300, 36))).toEqual({ coordinates: undefined, prevented: true })
  })

  it("leaves other keys alone", () => {
    expect(press("KeyX", box(300, 36))).toEqual({ coordinates: undefined, prevented: false })
  })
})
