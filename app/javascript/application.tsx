import { useState, useEffect, useMemo, useCallback } from "react"
import { createRoot } from "react-dom/client"
import { FeedSidebar } from "@/components/FeedSidebar"
import { EntryList } from "@/components/EntryList"
import { EntryContent } from "@/components/EntryContent"
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog"
import { SubscribeFeedDialog } from "@/components/SubscribeFeedDialog"
import { EditFeedDialog } from "@/components/EditFeedDialog"
import { api, Feed, Entry, Category } from "@/lib/api"
import { useKeyboardCommands, KeyboardCommand } from "@/hooks/useKeyboardCommands"

function App() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)

  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [virtualFeed, setVirtualFeed] = useState<"starred" | "fresh" | "published" | null>(null)

  const [_isLoadingFeeds, setIsLoadingFeeds] = useState(true)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [isLoadingEntry, setIsLoadingEntry] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false)
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)

  // Load feeds and categories on mount
  useEffect(() => {
    loadFeeds()
  }, [])

  // Load entries when selection changes
  useEffect(() => {
    loadEntries()
  }, [selectedFeedId, selectedCategoryId, virtualFeed])

  const loadFeeds = async () => {
    setIsLoadingFeeds(true)
    try {
      const [feedsData, categoriesData] = await Promise.all([
        api.feeds.list(),
        api.categories.list(),
      ])
      setFeeds(feedsData)
      setCategories(categoriesData)
    } catch (error) {
      console.error("Failed to load feeds:", error)
    } finally {
      setIsLoadingFeeds(false)
    }
  }

  const loadEntries = async () => {
    setIsLoadingEntries(true)
    try {
      const result = await api.entries.list({
        feed_id: selectedFeedId || undefined,
        category_id: selectedCategoryId || undefined,
        view: virtualFeed || undefined,
        per_page: 100,
      })
      setEntries(result.entries)
      setSelectedEntry(null)
    } catch (error) {
      console.error("Failed to load entries:", error)
    } finally {
      setIsLoadingEntries(false)
    }
  }

  const loadEntry = async (entryId: number) => {
    setIsLoadingEntry(true)
    try {
      const entry = await api.entries.get(entryId)
      setSelectedEntry(entry)

      // Mark as read when opening
      if (entry.unread) {
        await api.entries.toggleRead(entryId)
        setEntries((prev) =>
          prev.map((e) => (e.id === entryId ? { ...e, unread: false } : e))
        )
        loadFeeds() // Refresh unread counts
      }
    } catch (error) {
      console.error("Failed to load entry:", error)
    } finally {
      setIsLoadingEntry(false)
    }
  }

  const handleSelectFeed = (feedId: number | null) => {
    setSelectedFeedId(feedId)
    setSelectedCategoryId(null)
    setVirtualFeed(null)
  }

  const handleSelectCategory = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId)
    setSelectedFeedId(null)
    setVirtualFeed(null)
  }

  const handleSelectVirtualFeed = (feed: "starred" | "fresh" | "published" | null) => {
    setVirtualFeed(feed)
    setSelectedFeedId(null)
    setSelectedCategoryId(null)
  }

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await api.feeds.refreshAll()
      await loadFeeds()
      await loadEntries()
    } catch (error) {
      console.error("Failed to refresh feeds:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleToggleRead = async (entryId: number) => {
    try {
      const result = await api.entries.toggleRead(entryId)
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, unread: result.unread } : e))
      )
      if (selectedEntry?.id === entryId) {
        setSelectedEntry({ ...selectedEntry, unread: result.unread })
      }
      loadFeeds() // Refresh unread counts
    } catch (error) {
      console.error("Failed to toggle read:", error)
    }
  }

  const handleToggleStarredEntry = async (entryId: number) => {
    try {
      const result = await api.entries.toggleStarred(entryId)
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, starred: result.starred } : e))
      )
      if (selectedEntry?.id === entryId) {
        setSelectedEntry({ ...selectedEntry, starred: result.starred })
      }
    } catch (error) {
      console.error("Failed to toggle starred:", error)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.entries.markAllRead({
        feed_id: selectedFeedId || undefined,
        category_id: selectedCategoryId || undefined,
      })
      setEntries((prev) => prev.map((e) => ({ ...e, unread: false })))
      loadFeeds() // Refresh unread counts
    } catch (error) {
      console.error("Failed to mark all read:", error)
    }
  }

  const handleFeedCreated = (feed: Feed) => {
    setFeeds((prev) => [...prev, feed])
    // Select the new feed
    handleSelectFeed(feed.id)
  }

  const handleFeedUpdated = (updatedFeed: Feed) => {
    setFeeds((prev) =>
      prev.map((f) => (f.id === updatedFeed.id ? updatedFeed : f))
    )
  }

  const handleFeedDeleted = (feedId: number) => {
    setFeeds((prev) => prev.filter((f) => f.id !== feedId))
    // If the deleted feed was selected, clear selection
    if (selectedFeedId === feedId) {
      handleSelectFeed(null)
    }
  }

  const currentIndex = selectedEntry
    ? entries.findIndex((e) => e.id === selectedEntry.id)
    : -1

  const handlePrevious = () => {
    if (currentIndex > 0) {
      loadEntry(entries[currentIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (currentIndex < entries.length - 1) {
      loadEntry(entries[currentIndex + 1].id)
    }
  }

  // Keyboard navigation handlers - use useCallback to avoid stale closures
  const handleKeyboardNext = useCallback(() => {
    if (entries.length === 0) return
    if (currentIndex === -1) {
      // No entry selected, select first
      loadEntry(entries[0].id)
    } else if (currentIndex < entries.length - 1) {
      loadEntry(entries[currentIndex + 1].id)
    }
  }, [entries, currentIndex])

  const handleKeyboardPrevious = useCallback(() => {
    if (entries.length === 0) return
    if (currentIndex === -1) {
      // No entry selected, select last
      loadEntry(entries[entries.length - 1].id)
    } else if (currentIndex > 0) {
      loadEntry(entries[currentIndex - 1].id)
    }
  }, [entries, currentIndex])

  // Keyboard action handlers
  const handleKeyboardToggleRead = useCallback(() => {
    if (selectedEntry) {
      handleToggleRead(selectedEntry.id)
    }
  }, [selectedEntry])

  const handleKeyboardToggleStarred = useCallback(() => {
    if (selectedEntry) {
      handleToggleStarredEntry(selectedEntry.id)
    }
  }, [selectedEntry])

  const handleKeyboardOpen = useCallback(() => {
    if (selectedEntry) {
      loadEntry(selectedEntry.id)
    } else if (entries.length > 0) {
      // If no entry selected, open first one
      loadEntry(entries[0].id)
    }
  }, [selectedEntry, entries])

  const handleKeyboardClose = useCallback(() => {
    setSelectedEntry(null)
  }, [])

  const handleKeyboardRefresh = useCallback(() => {
    loadEntries()
  }, [selectedFeedId, selectedCategoryId, virtualFeed])

  const handleKeyboardHelp = useCallback(() => {
    setShowKeyboardShortcuts((prev) => !prev)
  }, [])

  const handleKeyboardOpenOriginal = useCallback(() => {
    if (selectedEntry?.link) {
      window.open(selectedEntry.link, "_blank", "noopener,noreferrer")
    }
  }, [selectedEntry])

  const handleKeyboardGoAll = useCallback(() => {
    handleSelectVirtualFeed(null)
  }, [])

  const handleKeyboardGoFresh = useCallback(() => {
    handleSelectVirtualFeed("fresh")
  }, [])

  const handleKeyboardGoStarred = useCallback(() => {
    handleSelectVirtualFeed("starred")
  }, [])

  const keyboardCommands = useMemo<KeyboardCommand[]>(
    () => [
      // Navigation
      { key: "j", handler: handleKeyboardNext, description: "Next entry" },
      { key: "k", handler: handleKeyboardPrevious, description: "Previous entry" },
      { key: "n", handler: handleKeyboardNext, description: "Next entry" },
      { key: "p", handler: handleKeyboardPrevious, description: "Previous entry" },
      { key: "o", handler: handleKeyboardOpen, description: "Open entry" },
      { key: "Enter", handler: handleKeyboardOpen, description: "Open entry" },
      { key: "Escape", handler: handleKeyboardClose, description: "Close/deselect entry" },
      // Actions
      { key: "m", handler: handleKeyboardToggleRead, description: "Toggle read/unread" },
      { key: "u", handler: handleKeyboardToggleRead, description: "Toggle read/unread" },
      { key: "s", handler: handleKeyboardToggleStarred, description: "Toggle starred" },
      { key: "v", handler: handleKeyboardOpenOriginal, description: "Open original link" },
      { key: "r", handler: handleKeyboardRefresh, description: "Refresh entries" },
      // Go to views
      { key: "a", handler: handleKeyboardGoAll, description: "Go to All" },
      { key: "f", handler: handleKeyboardGoFresh, description: "Go to Fresh" },
      { key: "S", handler: handleKeyboardGoStarred, description: "Go to Starred", modifiers: { shift: true } },
      // Help
      { key: "?", handler: handleKeyboardHelp, description: "Show keyboard shortcuts" },
    ],
    [
      handleKeyboardNext,
      handleKeyboardPrevious,
      handleKeyboardToggleRead,
      handleKeyboardToggleStarred,
      handleKeyboardOpen,
      handleKeyboardClose,
      handleKeyboardRefresh,
      handleKeyboardOpenOriginal,
      handleKeyboardGoAll,
      handleKeyboardGoFresh,
      handleKeyboardGoStarred,
      handleKeyboardHelp,
    ]
  )

  useKeyboardCommands(keyboardCommands)

  const getListTitle = () => {
    if (virtualFeed === "starred") return "Starred"
    if (virtualFeed === "fresh") return "Fresh"
    if (virtualFeed === "published") return "Published"
    if (selectedFeedId) {
      const feed = feeds.find((f) => f.id === selectedFeedId)
      return feed?.title || "Feed"
    }
    if (selectedCategoryId) {
      const category = categories.find((c) => c.id === selectedCategoryId)
      return category?.title || "Category"
    }
    return "All Feeds"
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      <div style={{ width: "240px", flexShrink: 0, height: "100%" }}>
        <FeedSidebar
          feeds={feeds}
          categories={categories}
          selectedFeedId={selectedFeedId}
          selectedCategoryId={selectedCategoryId}
          virtualFeed={virtualFeed}
          onSelectFeed={handleSelectFeed}
          onSelectCategory={handleSelectCategory}
          onSelectVirtualFeed={handleSelectVirtualFeed}
          onRefreshAll={handleRefreshAll}
          isRefreshing={isRefreshing}
          onSubscribe={() => setShowSubscribeDialog(true)}
          onEditFeed={setEditingFeed}
        />
      </div>
      <div style={{ width: "320px", flexShrink: 0, height: "100%" }}>
        <EntryList
          entries={entries}
          selectedEntryId={selectedEntry?.id || null}
          onSelectEntry={loadEntry}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarredEntry}
          onMarkAllRead={handleMarkAllRead}
          isLoading={isLoadingEntries}
          title={getListTitle()}
        />
      </div>
      <div style={{ flex: 1, height: "100%", minWidth: 0 }}>
        <EntryContent
          entry={selectedEntry}
          onToggleRead={() => selectedEntry && handleToggleRead(selectedEntry.id)}
          onToggleStarred={() => selectedEntry && handleToggleStarredEntry(selectedEntry.id)}
          onPrevious={handlePrevious}
          onNext={handleNext}
          hasPrevious={currentIndex > 0}
          hasNext={currentIndex < entries.length - 1}
          isLoading={isLoadingEntry}
        />
      </div>
      <KeyboardShortcutsDialog
        open={showKeyboardShortcuts}
        onOpenChange={setShowKeyboardShortcuts}
      />
      <SubscribeFeedDialog
        open={showSubscribeDialog}
        onOpenChange={setShowSubscribeDialog}
        categories={categories}
        onFeedCreated={handleFeedCreated}
      />
      <EditFeedDialog
        feed={editingFeed}
        open={editingFeed !== null}
        onOpenChange={(open) => !open && setEditingFeed(null)}
        categories={categories}
        onFeedUpdated={handleFeedUpdated}
        onFeedDeleted={handleFeedDeleted}
      />
    </div>
  )
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("react-root")
  if (container) {
    const root = createRoot(container)
    root.render(<App />)
  }
})
