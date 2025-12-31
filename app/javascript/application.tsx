import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import { FeedSidebar } from "@/components/FeedSidebar"
import { EntryList } from "@/components/EntryList"
import { EntryContent } from "@/components/EntryContent"
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcutsDialog"
import { SubscribeFeedDialog } from "@/components/SubscribeFeedDialog"
import { EditFeedDialog } from "@/components/EditFeedDialog"
import { MoveFeedDialog, useMoveFeedDialog } from "@/components/MoveFeedDialog"
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette"
import { SettingsDialog } from "@/components/SettingsDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { AudioPanel } from "@/components/AudioPanel"
import { MobileNavBar } from "@/components/mobile/MobileNavBar"
import { SidebarDrawer } from "@/components/mobile/SidebarDrawer"
import { PreferencesProvider, usePreferences } from "@/contexts/PreferencesContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { I18nProvider } from "@/contexts/I18nContext"
import { AudioPlayerProvider, useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext"
import { api, Feed, Entry, Category, SortConfig, paramToSortConfig, sortConfigToParam } from "@/lib/api"
import { useKeyboardCommands, KeyboardCommand } from "@/hooks/useKeyboardCommands"
import { useNavigationHistory } from "@/hooks/useNavigationHistory"
import { getVirtualFolder } from "@/lib/virtualFolders"

function App() {
  const { preferences, updatePreference } = usePreferences()
  const audioPlayer = useAudioPlayer()
  const layout = useLayout()
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const [allTagsWithCounts, setAllTagsWithCounts] = useState<Array<{ name: string; count: number }>>([])
  const [virtualFolderCounts, setVirtualFolderCounts] = useState<{
    fresh: number
    starred: number
    published: number
  } | null>(null)

  const [selectedFeedId, setSelectedFeedId] = useState<number | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [virtualFeed, setVirtualFeed] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  // Fresh view parameters (session-only, not persisted)
  const [freshMaxAge, setFreshMaxAge] = useState<"week" | "month" | "all">("week")
  const [freshPerFeed, setFreshPerFeed] = useState<number | null>(5)

  const [_isLoadingFeeds, setIsLoadingFeeds] = useState(true)
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [isLoadingEntry, setIsLoadingEntry] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  const [showSubscribeDialog, setShowSubscribeDialog] = useState(false)
  const [subscribeInitialUrl, setSubscribeInitialUrl] = useState<string | undefined>()
  const [editingFeed, setEditingFeed] = useState<Feed | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState("feeds")
  const [showMarkAllReadConfirm, setShowMarkAllReadConfirm] = useState(false)
  const [showIframe, setShowIframe] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [boundaryHit, setBoundaryHit] = useState<"start" | "end" | null>(null)
  const commandPalette = useCommandPalette()
  const moveFeedDialog = useMoveFeedDialog()
  const contentScrollRef = useRef<HTMLDivElement>(null)

  // Navigation history for back button support
  const navigationHistory = useNavigationHistory({
    onSelectFeed: (feedId) => {
      setSelectedFeedId(feedId)
      if (feedId !== null) {
        setSelectedCategoryId(null)
        setVirtualFeed(null)
      }
    },
    onSelectCategory: (categoryId) => {
      setSelectedCategoryId(categoryId)
      if (categoryId !== null) {
        setSelectedFeedId(null)
        setVirtualFeed(null)
      }
    },
    onSelectVirtualFeed: (feed) => {
      setVirtualFeed(feed)
      if (feed !== null) {
        setSelectedFeedId(null)
        setSelectedCategoryId(null)
      }
    },
    onShowSettings: (show, tab) => {
      setShowSettings(show)
      if (tab) setSettingsTab(tab)
    },
    onShowSubscribe: setShowSubscribeDialog,
  })

  // Load feeds, categories, tags, and counters on mount
  useEffect(() => {
    loadFeeds()
    loadTags()
    loadCounters()
  }, [])

  // Register audio player navigation callback
  useEffect(() => {
    audioPlayer.setOnJumpToEntry((entryId: number) => {
      loadEntry(entryId)
    })
    return () => {
      audioPlayer.setOnJumpToEntry(null)
    }
  }, [])

  const loadTags = async () => {
    try {
      const result = await api.tags.list()
      setAllTags(result.tags)
      setAllTagsWithCounts(result.tags_with_counts)
    } catch (error) {
      console.error("Failed to load tags:", error)
    }
  }

  const loadCounters = async () => {
    try {
      const result = await api.counters.get()
      setVirtualFolderCounts({
        fresh: result.virtual.fresh,
        starred: result.virtual.starred,
        published: result.virtual.published,
      })
    } catch (error) {
      console.error("Failed to load counters:", error)
    }
  }

  // Check for subscribe URL parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const subscribeUrl = params.get("subscribe")
    if (subscribeUrl) {
      setSubscribeInitialUrl(subscribeUrl)
      setShowSubscribeDialog(true)
      // Clear the URL parameter without reloading
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  // Load entries when selection, sort order, filter preferences, or fresh params change
  useEffect(() => {
    loadEntries()
  }, [selectedFeedId, selectedCategoryId, virtualFeed, selectedTag, preferences.entries_sort_config, preferences.entries_sort_by_score, preferences.entries_hide_read, preferences.entries_hide_unstarred, freshMaxAge, freshPerFeed])

  // Reset iframe view to default when entry changes
  useEffect(() => {
    setShowIframe(preferences.content_view_mode === "iframe")
  }, [selectedEntry?.id, preferences.content_view_mode])

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
      const perPage = parseInt(preferences.default_view_limit, 10) || 30
      const hideRead = preferences.entries_hide_read === "true"
      const hideUnstarred = preferences.entries_hide_unstarred === "true"
      // Convert empty string to undefined for API (All Feeds case)
      const viewParam = virtualFeed === "" ? undefined : virtualFeed
      // Use multi-column sort config if set, otherwise fall back to legacy sort_by_score
      const sortParam = preferences.entries_sort_config ||
        (preferences.entries_sort_by_score === "true" ? "score:desc" : "date:desc")
      const result = await api.entries.list({
        feed_id: selectedFeedId || undefined,
        category_id: selectedCategoryId || undefined,
        view: viewParam || undefined,
        sort: sortParam,
        unread: hideRead ? true : undefined,
        starred: hideUnstarred ? true : undefined,
        per_page: perPage,
        // Fresh view parameters
        fresh_max_age: virtualFeed === "fresh" ? freshMaxAge : undefined,
        fresh_per_feed: virtualFeed === "fresh" && freshPerFeed ? freshPerFeed : undefined,
        // Tag filter
        tag: selectedTag || undefined,
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
        loadCounters() // Refresh virtual folder counts
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
    setSelectedTag(null)
    if (feedId !== null) {
      navigationHistory.navigateToFeed(feedId)
    } else {
      navigationHistory.navigateToRoot()
    }
  }

  const handleSelectCategory = (categoryId: number | null) => {
    setSelectedCategoryId(categoryId)
    setSelectedFeedId(null)
    setVirtualFeed(null)
    setSelectedTag(null)
    if (categoryId !== null) {
      navigationHistory.navigateToCategory(categoryId)
    } else {
      navigationHistory.navigateToRoot()
    }
  }

  const handleSelectVirtualFeed = (feed: string | null) => {
    setVirtualFeed(feed)
    setSelectedFeedId(null)
    setSelectedCategoryId(null)
    setSelectedTag(null)
    if (feed !== null && feed !== "") {
      navigationHistory.navigateToVirtualFeed(feed)
    } else {
      navigationHistory.navigateToRoot()
    }
  }

  const handleSelectTag = (tag: string | null) => {
    setSelectedTag(tag)
    setSelectedFeedId(null)
    setSelectedCategoryId(null)
    setVirtualFeed(null)
    // No navigation history for tags (yet)
  }

  const handleRefreshAll = async () => {
    setIsRefreshing(true)
    try {
      await api.feeds.refreshAll()
      await loadFeeds()
      await loadCounters()
      await loadEntries()
    } catch (error) {
      console.error("Failed to refresh feeds:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleRefreshFeed = async (feedId: number) => {
    try {
      await api.feeds.refresh(feedId)
      await loadFeeds()
      await loadCounters()
      await loadEntries()
    } catch (error) {
      console.error("Failed to refresh feed:", error)
    }
  }

  const handleDeleteFeed = async (feedId: number) => {
    try {
      await api.feeds.delete(feedId)
      setFeeds((prev) => prev.filter((f) => f.id !== feedId))
      if (selectedFeedId === feedId) {
        handleSelectFeed(null)
      }
    } catch (error) {
      console.error("Failed to delete feed:", error)
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
      loadCounters() // Refresh virtual folder counts
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
      loadCounters() // Refresh starred count
    } catch (error) {
      console.error("Failed to toggle starred:", error)
    }
  }

  const handleUpdateNote = async (note: string) => {
    if (!selectedEntry) return
    try {
      await api.entries.update(selectedEntry.id, { entry: { note } })
      setEntries((prev) =>
        prev.map((e) => (e.id === selectedEntry.id ? { ...e, note } : e))
      )
      setSelectedEntry({ ...selectedEntry, note })
    } catch (error) {
      console.error("Failed to update note:", error)
      throw error // Re-throw so the UI can handle it
    }
  }

  const handleAddTag = async (tagName: string) => {
    if (!selectedEntry) return
    try {
      const result = await api.entryTags.add(selectedEntry.id, tagName)
      setSelectedEntry({ ...selectedEntry, tags: result.tags })
      // If this is a new tag, add it to allTags
      if (!allTags.includes(tagName.toLowerCase())) {
        setAllTags((prev) => [...prev, tagName.toLowerCase()].sort())
      }
    } catch (error) {
      console.error("Failed to add tag:", error)
      throw error
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    if (!selectedEntry) return
    try {
      const result = await api.entryTags.remove(selectedEntry.id, tagName)
      setSelectedEntry({ ...selectedEntry, tags: result.tags })
    } catch (error) {
      console.error("Failed to remove tag:", error)
      throw error
    }
  }

  const handleToggleIframe = useCallback(() => {
    setShowIframe((prev) => !prev)
  }, [])

  const handleSetScore = async (entryId: number, score: number) => {
    try {
      await api.entries.update(entryId, { entry: { score } })
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, score } : e))
      )
      if (selectedEntry?.id === entryId) {
        setSelectedEntry({ ...selectedEntry, score })
      }
    } catch (error) {
      console.error("Failed to update score:", error)
    }
  }

  const doMarkAllRead = async () => {
    try {
      await api.entries.markAllRead({
        feed_id: selectedFeedId || undefined,
        category_id: selectedCategoryId || undefined,
      })
      setEntries((prev) => prev.map((e) => ({ ...e, unread: false })))
      loadFeeds() // Refresh unread counts
      loadCounters() // Refresh virtual folder counts
    } catch (error) {
      console.error("Failed to mark all read:", error)
    }
  }

  const handleMarkAllRead = () => {
    const unreadCount = entries.filter((e) => e.unread).length
    if (unreadCount === 0) return

    if (preferences.confirm_feed_catchup === "true") {
      setShowMarkAllReadConfirm(true)
    } else {
      doMarkAllRead()
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

  const handleCategoryCreated = (newCategory: Category) => {
    setCategories((prev) => [...prev, newCategory])
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

  // Parse sort config from preference, with fallback for legacy sort_by_score
  const sortConfig = useMemo(() => {
    if (preferences.entries_sort_config) {
      return paramToSortConfig(preferences.entries_sort_config)
    }
    // Legacy fallback: convert sort_by_score to sort config
    if (preferences.entries_sort_by_score === "true") {
      return [{ column: "score" as const, direction: "desc" as const }]
    }
    return [{ column: "date" as const, direction: "desc" as const }]
  }, [preferences.entries_sort_config, preferences.entries_sort_by_score])

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

  // Trigger boundary hit feedback with auto-clear
  const triggerBoundaryFeedback = useCallback((boundary: "start" | "end") => {
    setBoundaryHit(boundary)
    setTimeout(() => setBoundaryHit(null), 300)
  }, [])

  // Keyboard navigation handlers - use useCallback to avoid stale closures
  const handleKeyboardNext = useCallback(() => {
    if (entries.length === 0) return
    if (currentIndex === -1) {
      // No entry selected, select first
      loadEntry(entries[0].id)
    } else if (currentIndex < entries.length - 1) {
      loadEntry(entries[currentIndex + 1].id)
    } else {
      // At end of list, trigger boundary feedback
      triggerBoundaryFeedback("end")
    }
  }, [entries, currentIndex, triggerBoundaryFeedback])

  const handleKeyboardPrevious = useCallback(() => {
    if (entries.length === 0) return
    if (currentIndex === -1) {
      // No entry selected, select last
      loadEntry(entries[entries.length - 1].id)
    } else if (currentIndex > 0) {
      loadEntry(entries[currentIndex - 1].id)
    } else {
      // At start of list, trigger boundary feedback
      triggerBoundaryFeedback("start")
    }
  }, [entries, currentIndex, triggerBoundaryFeedback])

  const handleKeyboardNextUnread = useCallback(() => {
    if (entries.length === 0) return
    const startIndex = currentIndex === -1 ? -1 : currentIndex
    // Find next unread entry
    for (let i = startIndex + 1; i < entries.length; i++) {
      if (entries[i].unread) {
        loadEntry(entries[i].id)
        return
      }
    }
    // No unread found after current position
  }, [entries, currentIndex])

  // Helper to get category_id for an entry via its feed
  const getCategoryForEntry = useCallback(
    (entry: Entry): number | null => {
      const feed = feeds.find((f) => f.id === entry.feed_id)
      return feed?.category_id ?? null
    },
    [feeds]
  )

  const handleKeyboardNextCategory = useCallback(() => {
    if (entries.length === 0) return
    const startIndex = currentIndex === -1 ? 0 : currentIndex
    const currentCategory = getCategoryForEntry(entries[startIndex])

    // Find next entry with a different category
    for (let i = startIndex + 1; i < entries.length; i++) {
      if (getCategoryForEntry(entries[i]) !== currentCategory) {
        loadEntry(entries[i].id)
        return
      }
    }
    // No different category found - stay at current position
  }, [entries, currentIndex, getCategoryForEntry])

  const handleKeyboardPreviousCategory = useCallback(() => {
    if (entries.length === 0) return
    const startIndex = currentIndex === -1 ? entries.length - 1 : currentIndex
    const currentCategory = getCategoryForEntry(entries[startIndex])

    // Find previous entry with a different category, then go to the first entry of that category
    let targetCategory: number | null | undefined = undefined
    let firstOfTargetCategory = -1

    for (let i = startIndex - 1; i >= 0; i--) {
      const entryCategory = getCategoryForEntry(entries[i])
      if (targetCategory === undefined && entryCategory !== currentCategory) {
        // Found a different category
        targetCategory = entryCategory
        firstOfTargetCategory = i
      } else if (targetCategory !== undefined && entryCategory === targetCategory) {
        // Still in the target category, update first index
        firstOfTargetCategory = i
      } else if (targetCategory !== undefined && entryCategory !== targetCategory) {
        // We've passed through the target category, stop
        break
      }
    }

    if (firstOfTargetCategory >= 0) {
      loadEntry(entries[firstOfTargetCategory].id)
    }
  }, [entries, currentIndex, getCategoryForEntry])

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
    // If in focus mode, exit it; otherwise close the selected entry
    if (focusMode) {
      setFocusMode(false)
    } else {
      setSelectedEntry(null)
    }
  }, [focusMode])

  const handleKeyboardRefresh = useCallback(() => {
    loadEntries()
  }, [selectedFeedId, selectedCategoryId, virtualFeed, selectedTag])

  // Handle multi-column sort changes from EntryList
  const handleSortChange = useCallback((newSort: SortConfig[]) => {
    const sortString = sortConfigToParam(newSort)
    updatePreference("entries_sort_config", sortString)
  }, [updatePreference])

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

  const handleContentPageDown = useCallback(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollBy({
        top: contentScrollRef.current.clientHeight * 0.9,
        behavior: "smooth",
      })
    }
  }, [])

  const handleContentPageUp = useCallback(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollBy({
        top: -contentScrollRef.current.clientHeight * 0.9,
        behavior: "smooth",
      })
    }
  }, [])

  const handleToggleSidebar = useCallback(() => {
    const newValue = preferences.sidebar_collapsed === "true" ? "false" : "true"
    updatePreference("sidebar_collapsed", newValue)
  }, [preferences.sidebar_collapsed, updatePreference])

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev)
  }, [])

  const handleExitFocusMode = useCallback(() => {
    setFocusMode(false)
  }, [])

  const keyboardCommands = useMemo<KeyboardCommand[]>(
    () => [
      // Navigation
      { key: "j", handler: handleKeyboardNext, description: "Next entry" },
      { key: "k", handler: handleKeyboardPrevious, description: "Previous entry" },
      { key: "J", handler: handleKeyboardNextCategory, description: "Next category", modifiers: { shift: true } },
      { key: "K", handler: handleKeyboardPreviousCategory, description: "Previous category", modifiers: { shift: true } },
      { key: "n", handler: handleKeyboardNext, description: "Next entry" },
      { key: "p", handler: handleKeyboardPrevious, description: "Previous entry" },
      { key: " ", handler: handleKeyboardNextUnread, description: "Next unread" },
      { key: "o", handler: handleKeyboardOpen, description: "Open entry" },
      { key: "Enter", handler: handleKeyboardOpen, description: "Open entry" },
      { key: "Escape", handler: handleKeyboardClose, description: "Close/deselect entry" },
      // Actions
      { key: "m", handler: handleKeyboardToggleRead, description: "Toggle read/unread" },
      { key: "u", handler: handleKeyboardToggleRead, description: "Toggle read/unread" },
      { key: "s", handler: handleKeyboardToggleStarred, description: "Toggle starred" },
      { key: "i", handler: handleToggleIframe, description: "Toggle iframe/RSS view" },
      { key: "v", handler: handleKeyboardOpenOriginal, description: "Open original link" },
      { key: "r", handler: handleKeyboardRefresh, description: "Refresh entries" },
      // Go to views
      { key: "a", handler: handleKeyboardGoAll, description: "Go to All" },
      { key: "f", handler: handleKeyboardGoFresh, description: "Go to Fresh" },
      { key: "S", handler: handleKeyboardGoStarred, description: "Go to Starred", modifiers: { shift: true } },
      // Content scrolling
      { key: "f", handler: handleContentPageDown, description: "Page down content", modifiers: { ctrl: true } },
      { key: "b", handler: handleContentPageUp, description: "Page up content", modifiers: { ctrl: true } },
      // Sidebar
      { key: "b", handler: handleToggleSidebar, description: "Toggle sidebar" },
      // Focus mode
      { key: "F", handler: handleToggleFocusMode, description: "Toggle focus mode", modifiers: { shift: true } },
      // Help
      { key: "?", handler: handleKeyboardHelp, description: "Show keyboard shortcuts", modifiers: { shift: true } },
    ],
    [
      handleKeyboardNext,
      handleKeyboardPrevious,
      handleKeyboardNextUnread,
      handleKeyboardNextCategory,
      handleKeyboardPreviousCategory,
      handleKeyboardToggleRead,
      handleKeyboardToggleStarred,
      handleToggleIframe,
      handleKeyboardOpen,
      handleKeyboardClose,
      handleKeyboardRefresh,
      handleKeyboardOpenOriginal,
      handleKeyboardGoAll,
      handleKeyboardGoFresh,
      handleKeyboardGoStarred,
      handleKeyboardHelp,
      handleContentPageDown,
      handleContentPageUp,
      handleToggleSidebar,
      handleToggleFocusMode,
    ]
  )

  useKeyboardCommands(keyboardCommands)

  const getListTitle = () => {
    if (selectedTag) {
      return `Tag: ${selectedTag}`
    }
    if (virtualFeed !== null) {
      const vf = getVirtualFolder(virtualFeed)
      return vf?.name || "All Feeds"
    }
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

  // Compute pane visibility based on breakpoint and current pane
  // Note: On mobile, sidebar is handled by SidebarDrawer, not this function
  const getSidebarWidth = () => {
    if (focusMode) return "0px"
    if (layout.isTablet) {
      // Tablet: sidebar is either expanded or hidden
      return layout.currentPane === "sidebar" ? "240px" : "0px"
    }
    // Desktop: normal sidebar behavior
    return preferences.sidebar_collapsed === "true" ? "48px" : "240px"
  }

  const getListWidth = () => {
    if (focusMode) return "0px"
    if (layout.isMobile) {
      // Mobile: list takes full width when visible (not on content pane)
      return layout.currentPane === "content" ? "0px" : "100%"
    }
    if (layout.isTablet) {
      // Tablet: list is 320px when visible (list or content pane)
      return layout.currentPane === "sidebar" ? "0px" : "320px"
    }
    // Desktop: fixed 320px
    return "320px"
  }

  const getContentDisplay = () => {
    if (layout.isMobile) {
      // Mobile: content takes full width when visible
      return layout.currentPane === "content" ? "block" : "none"
    }
    if (layout.isTablet) {
      // Tablet: content visible when not on sidebar
      return layout.currentPane === "sidebar" ? "none" : "block"
    }
    // Desktop: always visible
    return "block"
  }

  // Handle selecting an entry - navigate to content on mobile
  const handleSelectEntryWithNav = (entryId: number) => {
    loadEntry(entryId)
    if (layout.isMobile) {
      layout.goToContent()
    }
  }

  // Handle selecting a feed - navigate to list on mobile
  const handleSelectFeedWithNav = (feedId: number | null) => {
    handleSelectFeed(feedId)
    if (layout.isMobile && feedId !== null) {
      layout.goToList()
    }
  }

  const handleSelectCategoryWithNav = (categoryId: number | null) => {
    handleSelectCategory(categoryId)
    if (layout.isMobile && categoryId !== null) {
      layout.goToList()
    }
  }

  const handleSelectVirtualFeedWithNav = (feed: string | null) => {
    handleSelectVirtualFeed(feed)
    if (layout.isMobile) {
      layout.goToList()
    }
  }

  const handleSelectTagWithNav = (tag: string | null) => {
    handleSelectTag(tag)
    if (layout.isMobile) {
      layout.goToList()
    }
  }

  // Calculate main container height based on audio player and mobile nav bar
  const getMainHeight = () => {
    let height = "100vh"
    const deductions: string[] = []

    if (audioPlayer.isVisible) {
      deductions.push("56px") // Audio panel height
    }
    if (layout.isMobile) {
      deductions.push("56px") // Mobile nav bar height
    }

    if (deductions.length > 0) {
      height = `calc(100vh - ${deductions.join(" - ")})`
    }
    return height
  }

  return (
    <>
    <div
      style={{
        display: "flex",
        height: getMainHeight(),
        width: "100vw",
        overflow: "hidden",
        transition: "height 200ms ease-out",
      }}
    >
      {/* Sidebar - wrapped in drawer on mobile */}
      {layout.isMobile ? (
        <SidebarDrawer>
          <FeedSidebar
            feeds={feeds}
            categories={categories}
            selectedFeedId={selectedFeedId}
            selectedCategoryId={selectedCategoryId}
            virtualFeed={virtualFeed}
            selectedTag={selectedTag}
            tagsWithCounts={allTagsWithCounts}
            virtualFolderCounts={virtualFolderCounts}
            onSelectFeed={handleSelectFeedWithNav}
            onSelectCategory={handleSelectCategoryWithNav}
            onSelectVirtualFeed={handleSelectVirtualFeedWithNav}
            onSelectTag={handleSelectTagWithNav}
            onRefreshAll={handleRefreshAll}
            isRefreshing={isRefreshing}
            onSubscribe={() => {
              setShowSubscribeDialog(true)
              navigationHistory.openSubscribe()
            }}
            onEditFeed={setEditingFeed}
            onSettings={() => {
              setShowSettings(true)
              navigationHistory.openSettings()
            }}
            onCategoriesChange={setCategories}
            onFeedsChange={setFeeds}
            onFeedUpdated={handleFeedUpdated}
            isCollapsed={false}
            onToggleCollapse={layout.goToList}
            trackedFeedId={preferences.sync_to_tree === "true" && selectedEntry?.feed_id ? selectedEntry.feed_id : null}
          />
        </SidebarDrawer>
      ) : (
        <div style={{
          width: getSidebarWidth(),
          flexShrink: 0,
          height: "100%",
          transition: "width 150ms ease-out",
          overflow: "hidden",
        }}>
          <FeedSidebar
            feeds={feeds}
            categories={categories}
            selectedFeedId={selectedFeedId}
            selectedCategoryId={selectedCategoryId}
            virtualFeed={virtualFeed}
            selectedTag={selectedTag}
            tagsWithCounts={allTagsWithCounts}
            virtualFolderCounts={virtualFolderCounts}
            onSelectFeed={handleSelectFeedWithNav}
            onSelectCategory={handleSelectCategoryWithNav}
            onSelectVirtualFeed={handleSelectVirtualFeedWithNav}
            onSelectTag={handleSelectTagWithNav}
            onRefreshAll={handleRefreshAll}
            isRefreshing={isRefreshing}
            onSubscribe={() => {
              setShowSubscribeDialog(true)
              navigationHistory.openSubscribe()
            }}
            onEditFeed={setEditingFeed}
            onSettings={() => {
              setShowSettings(true)
              navigationHistory.openSettings()
            }}
            onCategoriesChange={setCategories}
            onFeedsChange={setFeeds}
            onFeedUpdated={handleFeedUpdated}
            isCollapsed={preferences.sidebar_collapsed === "true"}
            onToggleCollapse={handleToggleSidebar}
            trackedFeedId={preferences.sync_to_tree === "true" && selectedEntry?.feed_id ? selectedEntry.feed_id : null}
          />
        </div>
      )}
      <div style={{
        width: getListWidth(),
        flexShrink: 0,
        height: "100%",
        transition: layout.isMobile ? "none" : "width 150ms ease-out",
        overflow: "hidden",
        position: layout.isMobile ? "absolute" : "relative",
        left: 0,
        top: 0,
        zIndex: layout.isMobile ? 10 : "auto",
        backgroundColor: layout.isMobile ? "var(--color-background)" : "transparent",
      }}>
        <EntryList
          entries={entries}
          selectedEntryId={selectedEntry?.id || null}
          onSelectEntry={handleSelectEntryWithNav}
          onToggleRead={handleToggleRead}
          onToggleStarred={handleToggleStarredEntry}
          onMarkAllRead={handleMarkAllRead}
          isLoading={isLoadingEntries}
          title={getListTitle()}
          isFreshView={virtualFeed === "fresh"}
          freshMaxAge={freshMaxAge}
          freshPerFeed={freshPerFeed}
          onFreshMaxAgeChange={setFreshMaxAge}
          onFreshPerFeedChange={setFreshPerFeed}
          selectedFeed={selectedFeedId ? feeds.find((f) => f.id === selectedFeedId) : null}
          onRefreshFeed={handleRefreshFeed}
          onEditFeed={setEditingFeed}
          onDeleteFeed={handleDeleteFeed}
          boundaryHit={boundaryHit}
          sortConfig={sortConfig}
          onSortChange={handleSortChange}
          onShowSidebar={layout.isMobile ? layout.goToSidebar : undefined}
        />
      </div>
      <div style={{
        flex: 1,
        height: "100%",
        minWidth: 0,
        display: getContentDisplay(),
        position: layout.isMobile ? "absolute" : "relative",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: layout.isMobile ? 5 : "auto",
        backgroundColor: layout.isMobile ? "var(--color-background)" : "transparent",
      }}>
        <EntryContent
          entry={selectedEntry}
          onToggleRead={() => selectedEntry && handleToggleRead(selectedEntry.id)}
          onToggleStarred={() => selectedEntry && handleToggleStarredEntry(selectedEntry.id)}
          onScoreChange={(score) => selectedEntry && handleSetScore(selectedEntry.id, score)}
          onPrevious={handlePrevious}
          onNext={handleNext}
          hasPrevious={currentIndex > 0}
          hasNext={currentIndex < entries.length - 1}
          isLoading={isLoadingEntry}
          scrollViewportRef={contentScrollRef}
          onUpdateNote={handleUpdateNote}
          showIframe={showIframe}
          onToggleIframe={handleToggleIframe}
          allTags={allTags}
          onAddTag={handleAddTag}
          onRemoveTag={handleRemoveTag}
          focusMode={focusMode}
          onToggleFocusMode={handleToggleFocusMode}
          onBack={layout.isMobile ? layout.goToList : undefined}
        />
      </div>
      <KeyboardShortcutsDialog
        open={showKeyboardShortcuts}
        onOpenChange={setShowKeyboardShortcuts}
      />
      <SubscribeFeedDialog
        open={showSubscribeDialog}
        onOpenChange={(open) => {
          if (!open && showSubscribeDialog) {
            // Closing - use history back instead of direct state change
            navigationHistory.closeDialogViaHistory()
            setSubscribeInitialUrl(undefined)
          } else {
            setShowSubscribeDialog(open)
          }
        }}
        categories={categories}
        onFeedCreated={handleFeedCreated}
        initialUrl={subscribeInitialUrl}
      />
      <EditFeedDialog
        feed={editingFeed}
        open={editingFeed !== null}
        onOpenChange={(open) => !open && setEditingFeed(null)}
        categories={categories}
        onFeedUpdated={handleFeedUpdated}
        onFeedDeleted={handleFeedDeleted}
      />
      <MoveFeedDialog
        open={moveFeedDialog.open && selectedFeedId !== null}
        onOpenChange={moveFeedDialog.setOpen}
        feed={selectedFeedId ? feeds.find((f) => f.id === selectedFeedId) || null : null}
        categories={categories}
        onFeedMoved={handleFeedUpdated}
        onCategoryCreated={handleCategoryCreated}
      />
      <CommandPalette
        open={commandPalette.open}
        onOpenChange={commandPalette.setOpen}
        placeholder="Jump to feed or category..."
        feeds={feeds}
        categories={categories}
        onSelectFeed={handleSelectFeed}
        onSelectCategory={handleSelectCategory}
        onSelectVirtualFeed={handleSelectVirtualFeed}
        mode="navigation"
      />
      <SettingsDialog
        open={showSettings}
        onOpenChange={(open) => {
          if (!open && showSettings) {
            // Closing - use history back instead of direct state change
            navigationHistory.closeDialogViaHistory()
          } else {
            setShowSettings(open)
          }
        }}
        activeTab={settingsTab}
        onTabChange={(tab) => {
          setSettingsTab(tab)
          navigationHistory.changeSettingsTab(tab)
        }}
        feeds={feeds}
        categories={categories}
        onFeedsChange={setFeeds}
        onCategoriesChange={setCategories}
      />
      <ConfirmDialog
        open={showMarkAllReadConfirm}
        onOpenChange={setShowMarkAllReadConfirm}
        title="Mark all as read?"
        description={`This will mark ${entries.filter((e) => e.unread).length} article(s) as read.`}
        confirmLabel="Mark as read"
        onConfirm={doMarkAllRead}
      />
    </div>
    <MobileNavBar hasSelectedEntry={selectedEntry !== null} />
    <AudioPanel />
    </>
  )
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("react-root")
  if (container) {
    const root = createRoot(container)
    root.render(
      <PreferencesProvider>
        <ThemeProvider>
          <I18nProvider>
            <LayoutProvider>
              <AudioPlayerProvider>
                <App />
              </AudioPlayerProvider>
            </LayoutProvider>
          </I18nProvider>
        </ThemeProvider>
      </PreferencesProvider>
    )
  }
})
