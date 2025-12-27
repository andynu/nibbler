import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { EnclosurePlayer } from "./EnclosurePlayer"
import type { Enclosure } from "@/lib/api"

// Helper to create test enclosures
function mockEnclosure(overrides: Partial<Enclosure> = {}): Enclosure {
  return {
    id: 1,
    content_url: "https://example.com/media.mp3",
    content_type: "audio/mpeg",
    title: "Test Media",
    duration: "120",
    width: 0,
    height: 0,
    ...overrides,
  }
}

describe("EnclosurePlayer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("no enclosures", () => {
    it("renders nothing when enclosures is empty", () => {
      const { container } = render(<EnclosurePlayer enclosures={[]} />)

      expect(container).toBeEmptyDOMElement()
    })

    it("renders nothing when enclosures is undefined", () => {
      // @ts-expect-error - testing undefined case
      const { container } = render(<EnclosurePlayer enclosures={undefined} />)

      expect(container).toBeEmptyDOMElement()
    })
  })

  describe("audio enclosures", () => {
    it("renders audio element for audio/* content types", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        content_url: "https://example.com/podcast.mp3",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const audio = document.querySelector("audio")
      expect(audio).toBeInTheDocument()
      expect(audio).toHaveAttribute("src", "https://example.com/podcast.mp3")
    })

    it("shows native controls on audio element", () => {
      const enclosure = mockEnclosure({ content_type: "audio/mpeg" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const audio = document.querySelector("audio")
      expect(audio).toHaveAttribute("controls")
    })

    it("sets preload to metadata", () => {
      const enclosure = mockEnclosure({ content_type: "audio/mpeg" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const audio = document.querySelector("audio")
      expect(audio).toHaveAttribute("preload", "metadata")
    })

    it("shows title when available", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        title: "Episode 42: Testing",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Episode 42: Testing")).toBeInTheDocument()
    })

    it("shows Audio when title not available", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        title: "",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Audio")).toBeInTheDocument()
    })

    it("shows duration formatted", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "3665", // 1:01:05
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("1:01:05")).toBeInTheDocument()
    })

    it("shows download button", () => {
      const enclosure = mockEnclosure({ content_type: "audio/mpeg" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const downloadLink = screen.getByTitle("Download")
      expect(downloadLink).toHaveAttribute("href", enclosure.content_url)
      expect(downloadLink).toHaveAttribute("download")
    })

    it("supports audio/ogg content type", () => {
      const enclosure = mockEnclosure({ content_type: "audio/ogg" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(document.querySelector("audio")).toBeInTheDocument()
    })

    it("supports audio/wav content type", () => {
      const enclosure = mockEnclosure({ content_type: "audio/wav" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(document.querySelector("audio")).toBeInTheDocument()
    })
  })

  describe("video enclosures", () => {
    it("renders video element for video/* content types", () => {
      const enclosure = mockEnclosure({
        content_type: "video/mp4",
        content_url: "https://example.com/video.mp4",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const video = document.querySelector("video")
      expect(video).toBeInTheDocument()
      expect(video).toHaveAttribute("src", "https://example.com/video.mp4")
    })

    it("shows native controls on video element", () => {
      const enclosure = mockEnclosure({ content_type: "video/mp4" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const video = document.querySelector("video")
      expect(video).toHaveAttribute("controls")
    })

    it("sets preload to metadata", () => {
      const enclosure = mockEnclosure({ content_type: "video/mp4" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const video = document.querySelector("video")
      expect(video).toHaveAttribute("preload", "metadata")
    })

    it("sets width when available", () => {
      const enclosure = mockEnclosure({
        content_type: "video/mp4",
        width: 1920,
        height: 1080,
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const video = document.querySelector("video")
      expect(video).toHaveAttribute("width", "1920")
    })

    it("sets height when available", () => {
      const enclosure = mockEnclosure({
        content_type: "video/mp4",
        width: 1920,
        height: 1080,
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const video = document.querySelector("video")
      expect(video).toHaveAttribute("height", "1080")
    })

    it("shows title when available", () => {
      const enclosure = mockEnclosure({
        content_type: "video/mp4",
        title: "Demo Video",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Demo Video")).toBeInTheDocument()
    })

    it("shows Video when title not available", () => {
      const enclosure = mockEnclosure({
        content_type: "video/mp4",
        title: "",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Video")).toBeInTheDocument()
    })

    it("supports video/webm content type", () => {
      const enclosure = mockEnclosure({ content_type: "video/webm" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(document.querySelector("video")).toBeInTheDocument()
    })

    it("supports video/ogg content type", () => {
      const enclosure = mockEnclosure({ content_type: "video/ogg" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(document.querySelector("video")).toBeInTheDocument()
    })
  })

  describe("image enclosures", () => {
    it("renders img element for image/* content types", () => {
      const enclosure = mockEnclosure({
        content_type: "image/jpeg",
        content_url: "https://example.com/image.jpg",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const img = screen.getByRole("img")
      expect(img).toHaveAttribute("src", "https://example.com/image.jpg")
    })

    it("shows title when available", () => {
      const enclosure = mockEnclosure({
        content_type: "image/png",
        title: "Screenshot",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Screenshot")).toBeInTheDocument()
    })

    it("shows Image when title not available", () => {
      const enclosure = mockEnclosure({
        content_type: "image/png",
        title: "",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Image")).toBeInTheDocument()
    })

    it("sets lazy loading on image", () => {
      const enclosure = mockEnclosure({ content_type: "image/png" })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const img = screen.getByRole("img")
      expect(img).toHaveAttribute("loading", "lazy")
    })

    it("shows open full size button", () => {
      const enclosure = mockEnclosure({
        content_type: "image/png",
        content_url: "https://example.com/image.png",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      const openLink = screen.getByTitle("Open full size")
      expect(openLink).toHaveAttribute("href", "https://example.com/image.png")
      expect(openLink).toHaveAttribute("target", "_blank")
    })
  })

  describe("other/unsupported types", () => {
    it("shows download link for unsupported types", () => {
      const enclosure = mockEnclosure({
        content_type: "application/pdf",
        title: "Report.pdf",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByRole("link", { name: "Download" })).toBeInTheDocument()
    })

    it("shows file type indicator", () => {
      const enclosure = mockEnclosure({
        content_type: "application/pdf",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("application/pdf")).toBeInTheDocument()
    })

    it("shows title when available", () => {
      const enclosure = mockEnclosure({
        content_type: "application/pdf",
        title: "Important Document",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Important Document")).toBeInTheDocument()
    })

    it("shows Attachment when title not available", () => {
      const enclosure = mockEnclosure({
        content_type: "application/pdf",
        title: "",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("Attachment")).toBeInTheDocument()
    })
  })

  describe("multiple enclosures", () => {
    it("renders all enclosures", () => {
      const enclosures = [
        mockEnclosure({ id: 1, content_type: "audio/mpeg", title: "Audio 1" }),
        mockEnclosure({ id: 2, content_type: "video/mp4", title: "Video 1" }),
        mockEnclosure({ id: 3, content_type: "image/png", title: "Image 1" }),
      ]

      render(<EnclosurePlayer enclosures={enclosures} />)

      expect(screen.getByText("Audio 1")).toBeInTheDocument()
      expect(screen.getByText("Video 1")).toBeInTheDocument()
      expect(screen.getByText("Image 1")).toBeInTheDocument()
    })

    it("renders correct player type for each", () => {
      const enclosures = [
        mockEnclosure({ id: 1, content_type: "audio/mpeg" }),
        mockEnclosure({ id: 2, content_type: "video/mp4" }),
      ]

      render(<EnclosurePlayer enclosures={enclosures} />)

      expect(document.querySelector("audio")).toBeInTheDocument()
      expect(document.querySelector("video")).toBeInTheDocument()
    })
  })

  describe("duration formatting", () => {
    it("formats minutes and seconds correctly", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "125", // 2:05
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("2:05")).toBeInTheDocument()
    })

    it("formats hours, minutes, seconds correctly", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "3665", // 1:01:05
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("1:01:05")).toBeInTheDocument()
    })

    it("handles zero duration", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "0",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      // Duration should not be displayed for zero
      expect(screen.queryByText("0:00")).not.toBeInTheDocument()
    })

    it("handles empty duration", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "",
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      // Should not show duration text
      const durationElements = screen.queryAllByText(/^\d+:\d+/)
      expect(durationElements.length).toBe(0)
    })

    it("pads seconds correctly", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: "65", // 1:05
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      expect(screen.getByText("1:05")).toBeInTheDocument()
    })
  })

  describe("edge cases", () => {
    it("handles enclosure without title", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        title: undefined as unknown as string,
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      // Should show fallback
      expect(screen.getByText("Audio")).toBeInTheDocument()
    })

    it("handles enclosure without duration", () => {
      const enclosure = mockEnclosure({
        content_type: "audio/mpeg",
        duration: undefined as unknown as string,
      })

      render(<EnclosurePlayer enclosures={[enclosure]} />)

      // Should render without crashing
      expect(document.querySelector("audio")).toBeInTheDocument()
    })
  })
})
