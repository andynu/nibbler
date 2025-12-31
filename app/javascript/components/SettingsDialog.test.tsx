import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import React, { useState } from "react"
import { SettingsDialog } from "./SettingsDialog"
import { mockFeed, mockCategory, mockPreferences } from "../../../test/fixtures/data"

// Wrapper component to provide controlled tab state for testing
function SettingsDialogWrapper(props: React.ComponentProps<typeof SettingsDialog>) {
  const [activeTab, setActiveTab] = useState(props.activeTab ?? "feeds")
  return (
    <SettingsDialog
      {...props}
      activeTab={activeTab}
      onTabChange={(tab) => {
        setActiveTab(tab)
        props.onTabChange?.(tab)
      }}
    />
  )
}

// Mock all sub-components
vi.mock("@/components/FeedOrganizer", () => ({
  FeedOrganizer: () => <div data-testid="feed-organizer">FeedOrganizer</div>,
}))

vi.mock("@/components/PreferencesPanel", () => ({
  PreferencesPanel: () => <div data-testid="preferences-panel">PreferencesPanel</div>,
}))

vi.mock("@/components/FilterManager", () => ({
  FilterManager: () => <div data-testid="filter-manager">FilterManager</div>,
}))

vi.mock("@/components/LabelManager", () => ({
  LabelManager: () => <div data-testid="label-manager">LabelManager</div>,
}))

vi.mock("@/components/OpmlPanel", () => ({
  OpmlPanel: () => <div data-testid="opml-panel">OpmlPanel</div>,
}))

vi.mock("@/components/ToolsPanel", () => ({
  ToolsPanel: () => <div data-testid="tools-panel">ToolsPanel</div>,
}))

describe("SettingsDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    feeds: [mockFeed()],
    categories: [mockCategory()],
    onFeedsChange: vi.fn(),
    onCategoriesChange: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("rendering", () => {
    it("shows dialog when open is true", () => {
      render(<SettingsDialog {...defaultProps} open={true} />)

      expect(screen.getByText("Settings")).toBeInTheDocument()
    })

    it("does not show dialog when open is false", () => {
      render(<SettingsDialog {...defaultProps} open={false} />)

      expect(screen.queryByText("Settings")).not.toBeInTheDocument()
    })

    it("has tabbed interface", () => {
      render(<SettingsDialog {...defaultProps} />)

      expect(screen.getByRole("tablist")).toBeInTheDocument()
    })

    it("shows all tabs", () => {
      render(<SettingsDialog {...defaultProps} />)

      expect(screen.getByRole("tab", { name: /feeds/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /filters/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /tags/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /import\/export/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /tools/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /preferences/i })).toBeInTheDocument()
      expect(screen.getByRole("tab", { name: /account/i })).toBeInTheDocument()
    })
  })

  describe("tab navigation", () => {
    it("default tab is Feeds", () => {
      render(<SettingsDialogWrapper {...defaultProps} />)

      expect(screen.getByTestId("feed-organizer")).toBeInTheDocument()
    })

    it("clicking Filters tab shows FilterManager", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /filters/i }))

      expect(screen.getByTestId("filter-manager")).toBeInTheDocument()
    })

    it("clicking Tags tab shows LabelManager", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /tags/i }))

      expect(screen.getByTestId("label-manager")).toBeInTheDocument()
    })

    it("clicking Import/Export tab shows OpmlPanel", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /import\/export/i }))

      expect(screen.getByTestId("opml-panel")).toBeInTheDocument()
    })

    it("clicking Tools tab shows ToolsPanel", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /tools/i }))

      expect(screen.getByTestId("tools-panel")).toBeInTheDocument()
    })

    it("clicking Preferences tab shows PreferencesPanel", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /preferences/i }))

      expect(screen.getByTestId("preferences-panel")).toBeInTheDocument()
    })

    it("clicking Account tab shows coming soon message", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      await user.click(screen.getByRole("tab", { name: /account/i }))

      expect(screen.getByText(/account settings coming soon/i)).toBeInTheDocument()
    })

    it("selected tab has correct state", async () => {
      const user = userEvent.setup()
      render(<SettingsDialogWrapper {...defaultProps} />)

      const filtersTab = screen.getByRole("tab", { name: /filters/i })
      await user.click(filtersTab)

      expect(filtersTab).toHaveAttribute("data-state", "active")
    })
  })
})
