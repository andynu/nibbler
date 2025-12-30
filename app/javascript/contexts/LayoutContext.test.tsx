import { render, screen, act } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { LayoutProvider, useLayout } from "./LayoutContext"

// Test component that uses the context
function TestConsumer() {
  const layout = useLayout()

  return (
    <div>
      <div data-testid="breakpoint">{layout.breakpoint}</div>
      <div data-testid="is-mobile">{layout.isMobile ? "true" : "false"}</div>
      <div data-testid="is-tablet">{layout.isTablet ? "true" : "false"}</div>
      <div data-testid="is-desktop">{layout.isDesktop ? "true" : "false"}</div>
      <div data-testid="current-pane">{layout.currentPane}</div>
      <div data-testid="can-go-back">{layout.canGoBack ? "true" : "false"}</div>
      <button onClick={layout.goToSidebar} data-testid="go-sidebar">
        Go to sidebar
      </button>
      <button onClick={layout.goToList} data-testid="go-list">
        Go to list
      </button>
      <button onClick={layout.goToContent} data-testid="go-content">
        Go to content
      </button>
      <button onClick={layout.goBack} data-testid="go-back">
        Go back
      </button>
    </div>
  )
}

// Helper to set window width (doesn't trigger resize event)
function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    writable: true,
    configurable: true,
    value: width,
  })
}

// Helper to trigger resize event
function triggerResize() {
  window.dispatchEvent(new Event("resize"))
}

describe("LayoutContext", () => {
  const originalWidth = window.innerWidth

  beforeEach(() => {
    // Start with desktop width
    setWindowWidth(1200)
  })

  afterEach(() => {
    // Restore original width
    setWindowWidth(originalWidth)
  })

  describe("breakpoint detection", () => {
    it("detects desktop breakpoint for width >= 1024", () => {
      setWindowWidth(1200)

      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      expect(screen.getByTestId("breakpoint")).toHaveTextContent("desktop")
      expect(screen.getByTestId("is-desktop")).toHaveTextContent("true")
      expect(screen.getByTestId("is-tablet")).toHaveTextContent("false")
      expect(screen.getByTestId("is-mobile")).toHaveTextContent("false")
    })

    it("detects tablet breakpoint for width 640-1023", () => {
      setWindowWidth(800)

      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      expect(screen.getByTestId("breakpoint")).toHaveTextContent("tablet")
      expect(screen.getByTestId("is-tablet")).toHaveTextContent("true")
      expect(screen.getByTestId("is-desktop")).toHaveTextContent("false")
      expect(screen.getByTestId("is-mobile")).toHaveTextContent("false")
    })

    it("detects mobile breakpoint for width < 640", () => {
      setWindowWidth(500)

      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      expect(screen.getByTestId("breakpoint")).toHaveTextContent("mobile")
      expect(screen.getByTestId("is-mobile")).toHaveTextContent("true")
      expect(screen.getByTestId("is-tablet")).toHaveTextContent("false")
      expect(screen.getByTestId("is-desktop")).toHaveTextContent("false")
    })

    it("updates breakpoint on window resize", () => {
      setWindowWidth(1200)

      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      expect(screen.getByTestId("breakpoint")).toHaveTextContent("desktop")

      act(() => {
        setWindowWidth(500)
        triggerResize()
      })

      expect(screen.getByTestId("breakpoint")).toHaveTextContent("mobile")
    })
  })

  describe("pane navigation", () => {
    it("starts with list pane as default", () => {
      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      expect(screen.getByTestId("current-pane")).toHaveTextContent("list")
    })

    it("navigates to sidebar pane", () => {
      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      act(() => {
        screen.getByTestId("go-sidebar").click()
      })

      expect(screen.getByTestId("current-pane")).toHaveTextContent("sidebar")
    })

    it("navigates to content pane", () => {
      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      act(() => {
        screen.getByTestId("go-content").click()
      })

      expect(screen.getByTestId("current-pane")).toHaveTextContent("content")
    })

    it("tracks navigation history", () => {
      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      // Initially no history
      expect(screen.getByTestId("can-go-back")).toHaveTextContent("false")

      act(() => {
        screen.getByTestId("go-sidebar").click()
      })

      // Now we have history
      expect(screen.getByTestId("can-go-back")).toHaveTextContent("true")
    })

    it("navigates back through history", () => {
      render(
        <LayoutProvider>
          <TestConsumer />
        </LayoutProvider>
      )

      // Navigate: list -> sidebar -> content
      act(() => {
        screen.getByTestId("go-sidebar").click()
      })
      act(() => {
        screen.getByTestId("go-content").click()
      })

      expect(screen.getByTestId("current-pane")).toHaveTextContent("content")

      // Go back to sidebar
      act(() => {
        screen.getByTestId("go-back").click()
      })
      expect(screen.getByTestId("current-pane")).toHaveTextContent("sidebar")

      // Go back to list
      act(() => {
        screen.getByTestId("go-back").click()
      })
      expect(screen.getByTestId("current-pane")).toHaveTextContent("list")

      // No more history
      expect(screen.getByTestId("can-go-back")).toHaveTextContent("false")
    })
  })

  describe("useLayout hook", () => {
    it("throws error when used outside Provider", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        render(<TestConsumer />)
      }).toThrow("useLayout must be used within a LayoutProvider")

      consoleSpy.mockRestore()
    })
  })
})
