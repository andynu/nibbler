import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ToolsPanel } from "@/components/ToolsPanel"

// What a browser actually puts in the bookmark when you drag the button to the
// bookmarks bar is the anchor's href *attribute*. React 19 rewrites any
// javascript: URL passed as an href prop into a throwing stub before it reaches
// the DOM, so every assertion here reads the attribute off the rendered
// element. Asserting on the prop, or on a ref callback having run, would pass
// against the broken version.
const REACT_STUB = "React has blocked"

function bookmarkletHref(): string {
  const link = screen.getByRole("link", { name: "Subscribe to NibbleRSS" })
  return link.getAttribute("href") ?? ""
}

/**
 * Run the bookmarklet the way a browser would when the bookmark is clicked:
 * strip the javascript: scheme and execute what is left.
 */
function runBookmarklet(href: string) {
  const source = decodeURIComponent(href.replace(/^javascript:/, ""))
  new Function(source)()
}

function addFeedLink(href: string, title?: string) {
  const link = document.createElement("link")
  link.setAttribute("rel", "alternate")
  link.setAttribute("type", "application/rss+xml")
  link.setAttribute("href", href)
  if (title) link.setAttribute("title", title)
  document.head.appendChild(link)
}

describe("ToolsPanel", () => {
  afterEach(() => {
    document.head.querySelectorAll("link[rel='alternate']").forEach((el) => el.remove())
  })

  describe("the drag-to-bookmarks-bar button", () => {
    it("carries the real bookmarklet in its href attribute", () => {
      render(<ToolsPanel />)

      expect(bookmarkletHref()).toMatch(/^javascript:\(function\(\)\{/)
    })

    it("is not React's sanitized javascript: stub", () => {
      render(<ToolsPanel />)

      expect(bookmarkletHref()).not.toContain(REACT_STUB)
    })

    it("stays draggable so the browser will accept it as a bookmark", () => {
      render(<ToolsPanel />)

      const link = screen.getByRole("link", { name: "Subscribe to NibbleRSS" })
      expect(link).toHaveAttribute("draggable", "true")
    })
  })

  describe("the bookmarklet in the href, when run", () => {
    let openSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      openSpy = vi.fn()
      vi.stubGlobal("open", openSpy)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it("opens Nibbler's subscribe URL for the page's feed link", () => {
      addFeedLink("https://example.com/feed.xml")
      render(<ToolsPanel />)

      runBookmarklet(bookmarkletHref())

      expect(openSpy).toHaveBeenCalledWith(
        `${window.location.origin}?subscribe=${encodeURIComponent("https://example.com/feed.xml")}`,
        "_blank",
      )
    })

    it("falls back to the current page URL when the page advertises no feed", () => {
      render(<ToolsPanel />)

      runBookmarklet(bookmarkletHref())

      expect(openSpy).toHaveBeenCalledWith(
        `${window.location.origin}?subscribe=${encodeURIComponent(window.location.href)}`,
        "_blank",
      )
    })
  })

  describe("the copy-to-clipboard path", () => {
    it("shows the same bookmarklet the button carries", () => {
      render(<ToolsPanel />)

      const input = screen.getByDisplayValue(/^javascript:\(function\(\)\{/)
      expect(input).toHaveValue(bookmarkletHref())
    })

    it("writes the bookmarklet to the clipboard", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      // After setup(), which installs a clipboard stub of its own.
      const user = userEvent.setup()
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      })

      render(<ToolsPanel />)
      await user.click(screen.getByRole("button", { name: "Copy to clipboard" }))

      expect(writeText).toHaveBeenCalledWith(bookmarkletHref())
    })
  })
})
