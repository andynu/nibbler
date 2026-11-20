import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect } from "vitest"
import { DndContext, KeyboardSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import type { ComponentType, ReactNode } from "react"
import { UnmountSafeDndContext, UnmountSafeKeyboardSensor } from "./unmountSafeKeyboardSensor"
import { preventedStrayDragKeys } from "../../../test/helpers/documentKeydown"

const ITEMS = ["one", "two", "three"]

function Row({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef } = useSortable({ id })
  return (
    <button ref={setNodeRef} {...attributes} {...listeners}>
      Move {id}
    </button>
  )
}

type ContextComponent = ComponentType<{ sensors: ReturnType<typeof useSensors>; children: ReactNode }>

function List({
  Context,
  sensor,
}: {
  Context: ContextComponent
  sensor: typeof KeyboardSensor
}) {
  const sensors = useSensors(useSensor(sensor, { coordinateGetter: sortableKeyboardCoordinates }))
  return (
    <Context sensors={sensors}>
      <SortableContext items={ITEMS}>
        {ITEMS.map((id) => (
          <Row key={id} id={id} />
        ))}
      </SortableContext>
    </Context>
  )
}

function renderList(Context: ContextComponent, sensor: typeof KeyboardSensor) {
  return render(<List Context={Context} sensor={sensor} />)
}

async function liftSecondRow() {
  const user = userEvent.setup()
  const grip = screen.getByRole("button", { name: "Move two" })
  grip.focus()
  await user.keyboard(" ")
  await waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))
  return { user, grip }
}

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("UnmountSafeKeyboardSensor", () => {
  describe("the dnd-kit 6.3.1 private members it reaches into", () => {
    // If one of these fails after a dnd-kit upgrade, the subclass no longer
    // releases a lifted row on unmount; rework it against the new sensor.
    const prototype = KeyboardSensor.prototype as unknown as Record<string, unknown>

    it("KeyboardSensor still has a detach() method", () => {
      expect(typeof prototype.detach).toBe("function")
    })

    it.each(["handleEnd", "handleCancel"])("KeyboardSensor.%s still ends through this.detach()", (name) => {
      expect(typeof prototype[name]).toBe("function")
      expect(String(prototype[name])).toContain("this.detach()")
    })
  })

  it("plain dnd-kit still leaves a lifted row's listener behind on unmount", async () => {
    // The reason this file exists. If it fails after an upgrade, dnd-kit
    // cleans up after itself and the subclass can go.
    const view = renderList(DndContext, KeyboardSensor)
    await liftSecondRow()

    view.unmount()

    expect(preventedStrayDragKeys()).not.toEqual([])
  })

  it("leaves no document listener behind when unmounted with a row lifted", async () => {
    const view = renderList(UnmountSafeDndContext, UnmountSafeKeyboardSensor)
    await liftSecondRow()

    view.unmount()

    expect(preventedStrayDragKeys()).toEqual([])
  })

  it("leaves no listener behind when unmounted before the pickup's deferred listener is added", async () => {
    const view = renderList(UnmountSafeDndContext, UnmountSafeKeyboardSensor)
    const grip = screen.getByRole("button", { name: "Move two" })
    grip.focus()
    fireEvent.keyDown(grip, { key: " ", code: "Space" })
    expect(grip).toHaveAttribute("aria-pressed", "true")

    view.unmount()
    await nextTick()
    await nextTick()

    expect(preventedStrayDragKeys()).toEqual([])
  })

  it("still drops and lifts again after a drag ends normally", async () => {
    renderList(UnmountSafeDndContext, UnmountSafeKeyboardSensor)
    const { user, grip } = await liftSecondRow()

    await user.keyboard(" ")
    await waitFor(() => expect(grip).not.toHaveAttribute("aria-pressed", "true"))
    expect(preventedStrayDragKeys()).toEqual([])

    await user.keyboard(" ")
    await waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))
    await user.keyboard("{Escape}")
    await waitFor(() => expect(grip).not.toHaveAttribute("aria-pressed", "true"))
  })
})
