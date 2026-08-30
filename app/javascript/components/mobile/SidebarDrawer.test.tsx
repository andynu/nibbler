import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ReactNode } from "react"
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext"
import { SidebarDrawer } from "./SidebarDrawer"

// LayoutProvider reads window.innerWidth at mount and again on every resize
// event, so the breakpoint is driven by setting the width and dispatching.
function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  })
}

function resizeTo(width: number) {
  act(() => {
    setWindowWidth(width)
    window.dispatchEvent(new Event("resize"))
  })
}

// Renders the drawer unconditionally, which is the arrangement the hook order
// has to survive. application.tsx puts it behind a `layout.isMobile` ternary
// whose other branch is a plain div, so there a breakpoint flip changes the
// element type and unmounts the drawer instead of re-rendering it.
function Harness({ children }: { children?: ReactNode }) {
  const layout = useLayout()

  return (
    <>
      <button onClick={layout.goToSidebar}>open sidebar</button>
      <SidebarDrawer>
        {children ?? <div data-testid="sidebar-child">Feed list</div>}
      </SidebarDrawer>
    </>
  )
}

function renderDrawer(width: number) {
  setWindowWidth(width)
  return render(
    <LayoutProvider>
      <Harness />
    </LayoutProvider>
  )
}

describe("SidebarDrawer", () => {
  const originalWidth = window.innerWidth

  beforeEach(() => {
    setWindowWidth(1200)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    setWindowWidth(originalWidth)
    document.body.style.overflow = ""
  })

  it("renders children bare above the mobile breakpoint", () => {
    renderDrawer(1200)

    expect(screen.getByTestId("sidebar-child")).toBeInTheDocument()
    expect(
      screen.queryByRole("dialog", { name: "Feed sidebar" })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Close sidebar" })
    ).not.toBeInTheDocument()
  })

  it("wraps children in the drawer below the mobile breakpoint", () => {
    renderDrawer(500)

    expect(screen.getByRole("dialog", { name: "Feed sidebar" })).toBeInTheDocument()
    expect(screen.getByTestId("sidebar-child")).toBeInTheDocument()
  })

  it("locks and releases body scroll as the drawer opens and closes", async () => {
    const user = userEvent.setup()
    renderDrawer(500)

    expect(document.body.style.overflow).toBe("")

    await user.click(screen.getByRole("button", { name: "open sidebar" }))
    expect(document.body.style.overflow).toBe("hidden")

    await user.click(screen.getByRole("button", { name: "Close sidebar" }))
    expect(document.body.style.overflow).toBe("")
  })

  it("closes the open drawer on Escape", async () => {
    const user = userEvent.setup()
    renderDrawer(500)

    await user.click(screen.getByRole("button", { name: "open sidebar" }))
    expect(document.body.style.overflow).toBe("hidden")

    await user.keyboard("{Escape}")
    expect(document.body.style.overflow).toBe("")
  })

  // The early return used to sit above the useCallback and the two useEffects,
  // so a mounted instance ran 0 list hooks on desktop and 3 on mobile.
  //
  // React 19.2 does not throw on that. useContext allocates no entry in the
  // hook list, so the desktop render leaves the fiber's memoizedState null, and
  // renderWithHooks picks the mount dispatcher on the next render for exactly
  // that condition. Going up the other way is what leaves damage: the desktop
  // render consumes none of the three hooks the mobile render mounted, so no
  // effect is re-run and none of their cleanups fire. The keydown listener
  // stays on the document and body.overflow stays wherever the drawer left it.
  // React logs "a change in the order of Hooks" and carries on.
  //
  // None of this is reachable in the shipped app: application.tsx:1101 is the
  // only call site, it renders the drawer only inside the `layout.isMobile`
  // ternary, and the other branch is a plain div, so crossing 640px swaps the
  // element type and React unmounts rather than re-renders. These tests reach
  // the defect by rendering the drawer unconditionally, which is what a second
  // call site would do (ttrb-qlpd).
  describe("breakpoint flip under a mounted instance (ttrb-qlpd)", () => {
    // Nothing else in this tree touches document keydown: LayoutProvider
    // listens on window for resize, and the two buttons are plain DOM.
    function keydownCalls(spy: { mock: { calls: unknown[][] } }): unknown[][] {
      return spy.mock.calls.filter((call) => call[0] === "keydown")
    }

    it("releases body scroll when an open drawer crosses up past the breakpoint", async () => {
      const user = userEvent.setup()
      renderDrawer(500)

      await user.click(screen.getByRole("button", { name: "open sidebar" }))
      expect(document.body.style.overflow).toBe("hidden")

      resizeTo(1200)

      // The drawer is gone from the screen, so the reader is looking at a
      // desktop page it has no business locking.
      expect(
        screen.queryByRole("dialog", { name: "Feed sidebar" })
      ).not.toBeInTheDocument()
      expect(document.body.style.overflow).toBe("")
    })

    it("takes its keydown listener off the document when it crosses up past the breakpoint", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")
      const removeEventListenerSpy = vi.spyOn(document, "removeEventListener")

      renderDrawer(500)
      expect(keydownCalls(addEventListenerSpy)).toHaveLength(1)

      resizeTo(1200)

      expect(keydownCalls(removeEventListenerSpy)).toHaveLength(1)
      expect(keydownCalls(addEventListenerSpy)).toHaveLength(1)
    })

    it("renders the drawer when it crosses down past the breakpoint", () => {
      renderDrawer(1200)
      expect(
        screen.queryByRole("dialog", { name: "Feed sidebar" })
      ).not.toBeInTheDocument()

      resizeTo(500)

      expect(screen.getByRole("dialog", { name: "Feed sidebar" })).toBeInTheDocument()
      expect(screen.getByTestId("sidebar-child")).toBeInTheDocument()
    })

    // There is no test here asserting on React's own "change in the order of
    // Hooks" console.error. It is deduped by component name in a module-level
    // Set, so it fires for the first test in the file that trips it and is
    // silent for every test after, whatever the code does. The two assertions
    // above stand on the damage instead.
  })

  // The effects sit below the early return's old position now, so they run on
  // desktop too. They have to stay inert there: no keydown listener that could
  // answer an Escape the drawer is not showing, and no write to body.overflow,
  // which nothing else in the tree owns but which the drawer would otherwise
  // clear on every desktop render.
  describe("stays inert above the breakpoint", () => {
    it("leaves body.overflow alone on desktop", async () => {
      const user = userEvent.setup()
      document.body.style.overflow = "scroll"

      renderDrawer(1200)
      expect(document.body.style.overflow).toBe("scroll")

      // currentPane can move on desktop; the drawer must still not touch scroll.
      await user.click(screen.getByRole("button", { name: "open sidebar" }))
      expect(document.body.style.overflow).toBe("scroll")
    })

    it("puts no keydown listener on the document on desktop", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener")

      renderDrawer(1200)

      expect(
        addEventListenerSpy.mock.calls.filter((call) => call[0] === "keydown")
      ).toHaveLength(0)
    })
  })
})
