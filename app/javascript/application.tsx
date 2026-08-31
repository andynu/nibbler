import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { createRoot } from "react-dom/client"
import { FeedSidebar } from "@/components/FeedSidebar"
import { EntryList } from "@/components/EntryList"
import { EntryContent } from "@/components/EntryContent"
import { StoriesPanel, StoryDetail } from "@/components/StoriesPanel"
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
import { LoginPage } from "@/components/LoginPage"
import { PreferencesProvider, usePreferences } from "@/contexts/PreferencesContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { I18nProvider } from "@/contexts/I18nContext"
import { AudioPlayerProvider, useAudioPlayer } from "@/contexts/AudioPlayerContext"
import { LayoutProvider, useLayout } from "@/contexts/LayoutContext"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { api, Feed, Entry, Category, FreshMaxAge, SearchResult, SortConfig, paramToSortConfig, sortConfigToParam } from "@/lib/api"
import { useKeyboardCommands, KeyboardCommand } from "@/hooks/useKeyboardCommands"
import { buildKeyboardCommands } from "@/lib/keyboardShortcuts"
import { useCategoryNavigation } from "@/hooks/useCategoryNavigation"
import { useNavigationHistory } from "@/hooks/useNavigationHistory"
import { useBackgroundRefresh } from "@/hooks/useBackgroundRefresh"
import { useCableHeartbeat } from "@/hooks/useCableHeartbeat"
import { useNewEntries } from "@/hooks/useNewEntries"
import { useContentPaging } from "@/hooks/useContentPaging"
import { useContentViewMode } from "@/hooks/useContentViewMode"
import { useCopyLink } from "@/hooks/useCopyLink"
import { useEntrySearch } from "@/hooks/useEntrySearch"
import { getVirtualFolder } from "@/lib/virtualFolders"
import { applyUnreadCounts } from "@/lib/unreadCounts"

// Virtual folder ids the entries API recognizes as a `view`. The virtual folder
// registry is open, so ids outside this set (All Feeds, the feed-list smart
// folders) must not be forwarded as a view.
const ENTRY_VIEWS = ["fresh", "starred", "published", "archived"] as const

function toEntryView(id: string | null) {
  return ENTRY_VIEWS.find((view) => view === id)
}

// How many background ticks pass before the feed and category lists themselves
// are reloaded rather than just recounted. Counts come off the counters
// response every tick; structure (a feed subscribed or dropped on another
// device) changes on nobody's schedule and is not worth two extra requests a
// minute, so it is picked up on the tenth tick and whenever the tab returns.
const FEED_RELOAD_EVERY_TICKS = 10

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
  const [freshMaxAge, setFreshMaxAge] = useState<FreshMaxAge>("week")
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
  // Sticky for the session: the stored preference sets the starting view, the
  // `i` key overrides it until toggled back.
  const { showIframe, toggleIframe } = useContentViewMode(preferences.content_view_mode)
  const [focusMode, setFocusMode] = useState(false)
  const [boundaryHit, setBoundaryHit] = useState<"start" | "end" | null>(null)
  // Category whose sidebar row is flashing because Shift+J/K could not move
  // past it. Null the rest of the time.
  const [categoryBoundaryHitId, setCategoryBoundaryHitId] = useState<number | null>(null)
  // Stories view state (only used when virtualFeed === "stories")
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(null)
  const [storiesReloadKey, setStoriesReloadKey] = useState(0)
  const commandPalette = useCommandPalette()
  const moveFeedDialog = useMoveFeedDialog()
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // Load feeds, categories, and tags on mount
  useEffect(() => {
    loadFeeds()
    loadTags()
  }, [])

  // Counters load on mount and again whenever the Fresh window or per-feed cap
  // changes, since the Fresh badge counts what those two selectors leave.
  useEffect(() => {
    loadCounters()
  }, [freshMaxAge, freshPerFeed])

  // Every other counter refresh hangs off something the reader did, so the
  // entries the feed-refresh job ingests server-side never reach the badges:
  // the Fresh count sits at whatever it was until you click into the list.
  // Poll for them instead, and re-ask the moment a hidden tab comes back.
  //
  // Feed and category rows carry unread badges of their own, and they have to
  // move on the same tick or the sidebar disagrees with itself. They come out
  // of the counters response, which already carries both maps, so a steady
  // tick spends one request here instead of three (ttrb-81wy). It also stops
  // replacing the feeds array every minute, which was churning object identity
  // under the sidebar for numbers that mostly had not changed.
  //
  // A full loadFeeds is still what notices structural change, so it runs when
  // the reader comes back to the tab - where an arbitrary amount of time has
  // passed - and every FEED_RELOAD_EVERY_TICKS ticks otherwise.
  //
  // Suspended while settings are open: FeedOrganizer edits `feeds` optimistically
  // through onFeedsChange, and its stale closures would fight a poll response.
  const ticksSinceFeedReload = useRef(0)
  useBackgroundRefresh(
    (reason) => {
      ticksSinceFeedReload.current += 1
      if (reason === "visible" || ticksSinceFeedReload.current >= FEED_RELOAD_EVERY_TICKS) {
        ticksSinceFeedReload.current = 0
        loadFeeds()
      }
      loadCounters()
    },
    { enabled: !showSettings }
  )

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
      const tags = await api.tags.list()
      setAllTags(tags.map((tag) => tag.name).sort())
      setAllTagsWithCounts(
        tags.map((tag) => ({ name: tag.name, count: tag.entry_count }))
      )
    } catch (error) {
      console.error("Failed to load tags:", error)
    }
  }

  const loadCounters = async () => {
    try {
      const result = await api.counters.get({
        fresh_max_age: freshMaxAge,
        fresh_per_feed: freshPerFeed ?? undefined,
      })
      setVirtualFolderCounts({
        fresh: result.virtual.fresh,
        starred: result.virtual.starred,
        published: result.virtual.published,
      })
      // The same response carries per-feed and per-category unread counts, so
      // the sidebar badges come off this request too rather than off a second
      // and third one (ttrb-81wy). Applied through the updater rather than a
      // captured array so an edit made while the request was in flight is
      // still the thing being overlaid.
      setFeeds((prev) => applyUnreadCounts(prev, result.feeds))
      setCategories((prev) => applyUnreadCounts(prev, result.categories))
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

  // The sort the list is asked for, resolved before it reaches the query below.
  //
  // It is deliberately the resolved string that the query depends on rather
  // than the two preferences behind it. entries_sort_config is absent from the
  // API response until the reader has stored a sort, so the raw preference can
  // move between renders while the sort it resolves to does not. Depending on
  // the raw preference made that a change, which rebuilt entriesQuery, which
  // reloaded a list that had not changed -- and loadEntries clears the
  // selection, so an article opened in the first moments after boot was closed
  // again under the reader (ttrb-8zv5).
  const entriesSort = preferences.entries_sort_config ||
    (preferences.entries_sort_by_score === "true" ? "score:desc" : "date:desc")

  // Everything that decides which entries the list holds, in one object. Both
  // the visible load and the background probe read it, so the probe cannot
  // drift into asking a different question than the list it is compared with.
  // Its identity is also the list's identity: a new object means a different
  // list, which is what invalidates a stored probe.
  const entriesQuery = useMemo(() => ({
    feed_id: selectedFeedId || undefined,
    category_id: selectedCategoryId || undefined,
    // Only the entry-backed virtual folders map to an API view. All Feeds ("")
    // and the feed-list smart folders have no server-side view and load unfiltered.
    view: toEntryView(virtualFeed),
    sort: entriesSort,
    unread: preferences.entries_hide_read === "true" ? true : undefined,
    starred: preferences.entries_hide_unstarred === "true" ? true : undefined,
    per_page: parseInt(preferences.default_view_limit, 10) || 30,
    // Fresh view parameters
    fresh_max_age: virtualFeed === "fresh" ? freshMaxAge : undefined,
    fresh_per_feed: virtualFeed === "fresh" && freshPerFeed ? freshPerFeed : undefined,
    // Tag filter
    tag: selectedTag || undefined,
  }), [
    selectedFeedId,
    selectedCategoryId,
    virtualFeed,
    selectedTag,
    entriesSort,
    preferences.entries_hide_read,
    preferences.entries_hide_unstarred,
    preferences.default_view_limit,
    freshMaxAge,
    freshPerFeed,
  ])

  // Article search, inheriting the list's own scope. `entriesQuery` is passed
  // through untouched apart from the two params that mean nothing to a ranked
  // result set, so the search and the list beside it cannot answer different
  // questions: every filter the list applies, the search applies too, until the
  // reader drops one from the pills under the box.
  const searchListScope = useMemo(() => {
    const { sort: _sort, per_page: _perPage, ...scope } = entriesQuery
    return scope
  }, [entriesQuery])

  const entrySearch = useEntrySearch(searchListScope)

  // Load entries when selection, sort order, filter preferences, or fresh params change
  useEffect(() => {
    loadEntries()
  }, [entriesQuery])

  // The list itself is deliberately left out of the tick above: loadEntries
  // clears the selection and replaces every row, so polling it would close the
  // open article and lose the reader's place once a minute. Probe for what
  // arrived instead and let the reader ask for it (ttrb-v565).
  //
  // Suspended for the stories view, which the entries API does not back, and
  // while settings are open, for the same reason the feed poll is.
  const newEntries = useNewEntries({
    entries,
    fetchEntries: async () => (await api.entries.list(entriesQuery)).entries,
    onApply: setEntries,
    scope: entriesQuery,
    enabled: !showSettings && virtualFeed !== "stories",
  })

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

  // Bumped by every load, so a reply may only write state while its sequence
  // is still the current one. Four call sites load the list - the entriesQuery
  // effect, both refresh handlers and the keyboard refresh - and none of them
  // cancelled the request already in flight, so which reply landed last was
  // the network's to decide rather than the reader's.
  //
  // A sort clicked while the boot load was still in flight lost that race
  // whenever the boot reply arrived second: setEntries put the old ordering's
  // rows back over the sorted ones, and nothing refetched afterwards, so they
  // stayed. The sort itself survives -- it lives in preferences, which this
  // path never touches -- which is what makes the result worse than a plain
  // stale list: the header goes on reporting a sort the rows beside it are
  // not in.
  //
  // This was masked by the preferences clobber fixed alongside it in
  // PreferencesContext (ttrb-p74f). That one reverted the header too, so the
  // two were indistinguishable from the outside until it was fixed; holding
  // the first reply until the second lands separates them and reproduces this
  // one on its own, every run (e2e/entry-list-sort.spec.ts).
  //
  // Same guard as useEntrySearch's requestSeq and useNewEntries' probeSeq.
  const entriesSeq = useRef(0)

  const loadEntries = async () => {
    const seq = ++entriesSeq.current
    // The stories view is not backed by the entries API; skip loading. The
    // bump above still counts: it abandons any request in flight, which would
    // otherwise repopulate the list this branch just emptied.
    if (virtualFeed === "stories") {
      setEntries([])
      setSelectedEntry(null)
      setIsLoadingEntries(false)
      return
    }
    setIsLoadingEntries(true)
    try {
      const result = await api.entries.list(entriesQuery)
      if (seq !== entriesSeq.current) return
      setEntries(result.entries)
      setSelectedEntry(null)
      // This list came straight from the server, so any stored probe is both
      // redundant and misleading: entries that fell off the end of the
      // per_page window would otherwise read as new.
      newEntries.reset()
    } catch (error) {
      console.error("Failed to load entries:", error)
    } finally {
      // A superseded load must not clear the flag: the load that replaced it
      // is still running, and the list is still loading.
      if (seq === entriesSeq.current) setIsLoadingEntries(false)
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
        // The search owns its own rows, so the entry list update above does not
        // reach them. Opening a hit is the commonest way into that: the reader
        // takes no deliberate action and the row they just clicked would go on
        // claiming to be unread (ttrb-zgvy).
        entrySearch.updateResult(entryId, { unread: false })
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

  const handleFollowStoryCreated = (story: { id: number }) => {
    // Navigate to the stories view with the newly created story selected,
    // matching the "redirect to /stories/:id" behavior from the spec.
    setSelectedStoryId(story.id)
    setStoriesReloadKey((k) => k + 1)
    handleSelectVirtualFeed("stories")
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
      entrySearch.updateResult(entryId, { unread: result.unread })
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
      entrySearch.updateResult(entryId, { starred: result.starred })
      if (selectedEntry?.id === entryId) {
        setSelectedEntry({ ...selectedEntry, starred: result.starred })
      }
      loadCounters() // Refresh starred count
    } catch (error) {
      console.error("Failed to toggle starred:", error)
    }
  }

  // No `entrySearch.updateResult` here, or in handleSetScore below, unlike the
  // read and starred handlers: SearchController's projection carries neither
  // `is_published` nor `score`, and SearchResultList draws neither, so a search
  // row has nothing that could go stale (ttrb-zgvy).
  const handleTogglePublishedEntry = async (entryId: number) => {
    try {
      const result = await api.entries.togglePublished(entryId)
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, is_published: result.is_published } : e))
      )
      if (selectedEntry?.id === entryId) {
        setSelectedEntry({ ...selectedEntry, is_published: result.is_published })
      }
      loadCounters() // Refresh published count
    } catch (error) {
      console.error("Failed to toggle published:", error)
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
      const normalizedName = tagName.toLowerCase()
      if (!allTags?.includes(normalizedName)) {
        setAllTags((prev) => [...(prev || []), normalizedName].sort())
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

  // Which search hits the mark-all-read sweep actually reached. While the
  // search is still on the list's own scope, all of them are: EntryScoping
  // resolves `category_id` through `self_and_descendant_ids`, the same
  // expansion mark_all_read does, so the hits are a subset of what was just
  // marked. Once the reader has widened to "everything" the results straddle
  // that boundary, and flipping the outside ones would show an article as read
  // on the strength of a sweep that never touched it.
  const sweptByMarkAllRead = useCallback(
    (result: SearchResult) => {
      if (entrySearch.place === "list") return true
      if (selectedFeedId) return result.feed_id === selectedFeedId
      if (selectedCategoryId) {
        // The feed's own category, then up the tree: marking a parent read
        // takes the feeds under its children with it. Bounded by the number of
        // categories, so bad data cannot spin here.
        let categoryId = feeds.find((f) => f.id === result.feed_id)?.category_id ?? null
        for (let step = 0; categoryId !== null && step <= categories.length; step++) {
          if (categoryId === selectedCategoryId) return true
          categoryId = categories.find((c) => c.id === categoryId)?.parent_id ?? null
        }
        return false
      }
      // Neither: the sweep was unscoped and reached every article the user has.
      return true
    },
    [entrySearch.place, selectedFeedId, selectedCategoryId, feeds, categories]
  )

  const doMarkAllRead = async () => {
    try {
      await api.entries.markAllRead({
        feed_id: selectedFeedId || undefined,
        category_id: selectedCategoryId || undefined,
      })
      setEntries((prev) => prev.map((e) => ({ ...e, unread: false })))
      entrySearch.updateResults(sweptByMarkAllRead, { unread: false })
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

  // Flash the row of the category the reader is parked on when Shift+J/K has
  // nowhere further to go. The entry-list flash above is the wrong surface for
  // a sidebar move, and an empty list has no row to flash at all.
  const triggerCategoryBoundaryFlash = useCallback((categoryId: number) => {
    setCategoryBoundaryHitId(categoryId)
    setTimeout(() => setCategoryBoundaryHitId(null), 300)
  }, [])

  const handleCategoryBoundary = useCallback(
    (direction: "next" | "previous", categoryId: number | null) => {
      if (categoryId !== null) {
        triggerCategoryBoundaryFlash(categoryId)
      } else {
        // Nothing selected and no category to select: there is no sidebar row
        // to flash, so fall back to the list's own end-of-the-line feedback.
        triggerBoundaryFeedback(direction === "next" ? "end" : "start")
      }
    },
    [triggerCategoryBoundaryFlash, triggerBoundaryFeedback]
  )

  const categoryNavigation = useCategoryNavigation({
    categories,
    feeds,
    selectedCategoryId,
    selectedFeedId,
    // The same expression FeedSidebar resolves its own hide-read state from.
    // updatePreference writes this optimistically, so the toggle in the sidebar
    // header changes what Shift+J and Shift+K can reach on the same render the
    // rows disappear on, with no request in between.
    hideReadFeeds: preferences.hide_read_feeds === "true",
    onSelectCategory: handleSelectCategory,
    onBoundary: handleCategoryBoundary,
  })
  const handleKeyboardNextCategory = categoryNavigation.selectNextCategory
  const handleKeyboardPreviousCategory = categoryNavigation.selectPreviousCategory

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

  const handleKeyboardTogglePublished = useCallback(() => {
    if (selectedEntry) {
      handleTogglePublishedEntry(selectedEntry.id)
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

  // The one refresh the reader can ask for directly, reached by `r` and by
  // pulling down at the top of the list on a phone (EntryList). It returns the
  // load rather than dropping it so the gesture can keep its indicator up for
  // exactly as long as the request takes; `r` ignores the promise, which is
  // what a `() => void` handler slot means.
  const handleKeyboardRefresh = useCallback(() => {
    return loadEntries()
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

  // `c` and the overflow menu's "Copy link" row both land here. What goes on
  // the clipboard is entry.link, the publisher's URL that "Open in new tab"
  // uses, not a Nibbler route. With no entry open there is nothing to copy and
  // nowhere to report it, so the key does nothing at all; every other outcome,
  // including an absent clipboard API outside a secure context, comes back as
  // a status EntryContent draws (see useCopyLink).
  const { status: copyLinkStatus, copy: copyLink } = useCopyLink()

  const handleKeyboardCopyLink = useCallback(() => {
    if (!selectedEntry) return
    copyLink(selectedEntry.link)
  }, [selectedEntry, copyLink])

  const handleKeyboardGoAll = useCallback(() => {
    handleSelectVirtualFeed(null)
  }, [])

  const handleKeyboardGoFresh = useCallback(() => {
    handleSelectVirtualFeed("fresh")
  }, [])

  const handleKeyboardGoStarred = useCallback(() => {
    handleSelectVirtualFeed("starred")
  }, [])

  // Space pages through the article body and only moves to another entry once
  // the reader reaches the end. The iframe view holds cross-origin content whose
  // scroll position cannot be read, so paging falls through to navigation there.
  const contentPaging = useContentPaging({
    scrollRef: contentScrollRef,
    onPastEnd: handleKeyboardNextUnread,
    onPastStart: handleKeyboardPrevious,
    measurable: !showIframe,
    resetKey: selectedEntry?.id,
  })

  const handleToggleSidebar = useCallback(() => {
    const newValue = preferences.sidebar_collapsed === "true" ? "false" : "true"
    updatePreference("sidebar_collapsed", newValue)
  }, [preferences.sidebar_collapsed, updatePreference])

  const handleToggleFocusMode = useCallback(() => {
    setFocusMode((prev) => !prev)
  }, [])

  // `/` puts the cursor in the list's search box. Focus mode hides the list, so
  // leave it first or there is nothing to focus. Typing `/` inside the box does
  // not come back here: useKeyboardCommands drops events targeting an input.
  const handleKeyboardFocusSearch = useCallback(() => {
    setFocusMode(false)
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [])

  // Keys, labels and descriptions live in the shared catalog
  // (lib/keyboardShortcuts.ts) that also drives KeyboardShortcutsDialog. Only
  // the handlers are wired here; the map is exhaustive over the catalog, so a
  // new shortcut fails to compile until it is handled.
  const keyboardCommands = useMemo<KeyboardCommand[]>(
    () =>
      buildKeyboardCommands({
        "next-entry": handleKeyboardNext,
        "previous-entry": handleKeyboardPrevious,
        "next-category": handleKeyboardNextCategory,
        "previous-category": handleKeyboardPreviousCategory,
        "page-down-or-next": contentPaging.pageDownOrNext,
        "page-up-or-previous": contentPaging.pageUpOrPrevious,
        "page-down-content": contentPaging.pageDown,
        "page-up-content": contentPaging.pageUp,
        "go-all": handleKeyboardGoAll,
        "go-fresh": handleKeyboardGoFresh,
        "go-starred": handleKeyboardGoStarred,
        "open-entry": handleKeyboardOpen,
        "toggle-read": handleKeyboardToggleRead,
        "toggle-starred": handleKeyboardToggleStarred,
        "toggle-published": handleKeyboardTogglePublished,
        "toggle-iframe": toggleIframe,
        "open-original": handleKeyboardOpenOriginal,
        "copy-link": handleKeyboardCopyLink,
        refresh: handleKeyboardRefresh,
        "focus-search": handleKeyboardFocusSearch,
        "toggle-focus-mode": handleToggleFocusMode,
        "toggle-sidebar": handleToggleSidebar,
        "close-entry": handleKeyboardClose,
        "show-shortcuts": handleKeyboardHelp,
      }),
    [
      handleKeyboardNext,
      handleKeyboardPrevious,
      handleKeyboardNextUnread,
      handleKeyboardNextCategory,
      handleKeyboardPreviousCategory,
      handleKeyboardToggleRead,
      handleKeyboardToggleStarred,
      handleKeyboardTogglePublished,
      toggleIframe,
      handleKeyboardOpen,
      handleKeyboardClose,
      handleKeyboardRefresh,
      handleKeyboardOpenOriginal,
      handleKeyboardCopyLink,
      handleKeyboardGoAll,
      handleKeyboardGoFresh,
      handleKeyboardGoStarred,
      handleKeyboardHelp,
      handleKeyboardFocusSearch,
      contentPaging,
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

  // The scope labels are read off `searchListScope`, the same object the
  // request is built from, rather than off the selection state behind it. A
  // label derived independently is a label that can drift into naming a filter
  // the request never carried.
  //
  // Place: which articles the list is showing at all. Everything here is
  // dropped together by the "All feeds" pill.
  const searchPlaceLabel = useMemo(() => {
    const parts: string[] = []
    if (searchListScope.feed_id) {
      parts.push(feeds.find((f) => f.id === searchListScope.feed_id)?.title || "This feed")
    }
    if (searchListScope.category_id) {
      parts.push(
        categories.find((c) => c.id === searchListScope.category_id)?.title || "This category"
      )
    }
    if (searchListScope.view === "starred") parts.push("Starred")
    if (searchListScope.view === "published") parts.push("Published")
    if (searchListScope.tag) parts.push(`#${searchListScope.tag}`)
    if (searchListScope.starred) parts.push("Starred only")
    return parts.length > 0 ? parts.join(" · ") : null
  }, [searchListScope, feeds, categories])

  // History: how far back the list reaches. Fresh is unread within a window,
  // Archived is read-only, and the hide-read preference is plain unread.
  const searchHistoryLabel = useMemo(() => {
    if (searchListScope.view === "fresh") return "Fresh"
    if (searchListScope.view === "archived") return "Read"
    if (searchListScope.unread === true) return "Unread"
    if (searchListScope.unread === false) return "Read"
    return null
  }, [searchListScope])

  // What the empty state blames for finding nothing: the narrowings still in
  // effect, in the reader's own words. Null once both pills have been widened,
  // which is when "all articles" is the honest thing to say.
  const searchScopeLabel = () => {
    const parts: string[] = []
    if (entrySearch.canWidenPlace && entrySearch.place === "list" && searchPlaceLabel) {
      parts.push(searchPlaceLabel)
    }
    if (entrySearch.canWidenHistory && entrySearch.history === "list" && searchHistoryLabel) {
      parts.push(searchHistoryLabel.toLowerCase())
    }
    return parts.length > 0 ? parts.join(", ") : null
  }

  // The empty state's way out: drop both narrowings at once, keeping the query.
  const widenSearchToEverything = () => {
    entrySearch.setPlace("everything")
    entrySearch.setHistory("all")
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
            boundaryHitCategoryId={categoryBoundaryHitId}
          />
        </SidebarDrawer>
      ) : (
        // The pane whose width focus mode drives to 0. Its own width is the
        // only honest handle on "the sidebar is gone": everything inside keeps
        // a bounding box when the pane clips it, so a descendant still reads as
        // visible to Playwright (ttrb-8zv5).
        <div
          data-testid="sidebar-pane"
          style={{
            width: getSidebarWidth(),
            flexShrink: 0,
            height: "100%",
            transition: "width 150ms ease-out",
            overflow: "hidden",
          }}
        >
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
            boundaryHitCategoryId={categoryBoundaryHitId}
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
        {virtualFeed === "stories" ? (
          <StoriesPanel
            selectedStoryId={selectedStoryId}
            onSelectStory={setSelectedStoryId}
            reloadKey={storiesReloadKey}
          />
        ) : (
          <EntryList
            entries={entries}
            selectedEntryId={selectedEntry?.id || null}
            onSelectEntry={handleSelectEntryWithNav}
            onToggleRead={handleToggleRead}
            onToggleStarred={handleToggleStarredEntry}
            onTogglePublished={handleTogglePublishedEntry}
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
            newEntryCount={newEntries.count}
            onShowNewEntries={newEntries.apply}
            sortConfig={sortConfig}
            onSortChange={handleSortChange}
            onShowSidebar={layout.isMobile ? layout.goToSidebar : undefined}
            // Same handler as `r`, so the touch gesture and the key cannot
            // drift into refreshing different things. Mobile only, matching
            // the sibling swipe gesture in EntryContent: on a desktop the
            // pointer generates no touch events and the key is right there.
            onPullToRefresh={layout.isMobile ? handleKeyboardRefresh : undefined}
            search={{
              query: entrySearch.query,
              onQueryChange: entrySearch.setQuery,
              onClear: entrySearch.clear,
              onDismiss: handleKeyboardClose,
              inputRef: searchInputRef,
              isActive: entrySearch.isActive,
              isSearching: entrySearch.isSearching,
              results: entrySearch.results,
              error: entrySearch.error,
              scopeLabel: searchScopeLabel(),
              scope: {
                place: entrySearch.place,
                history: entrySearch.history,
                onPlaceChange: entrySearch.setPlace,
                onHistoryChange: entrySearch.setHistory,
                // A pill only appears where the hook says there is something to
                // widen, so the control can never advertise an escape from a
                // filter the request does not carry.
                placeLabel: entrySearch.canWidenPlace ? searchPlaceLabel : null,
                historyLabel: entrySearch.canWidenHistory ? searchHistoryLabel : null,
              },
              // The search's own ordering, not the list's: relevance until the
              // reader says otherwise, and back to relevance when the box is
              // cleared. The list's sort above is left exactly where it was, so
              // clearing the query restores it.
              sortConfig: entrySearch.sort,
              onSortChange: entrySearch.setSort,
              widerMatchCount: entrySearch.widerMatchCount,
              onWiden: widenSearchToEverything,
            }}
          />
        )}
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
        {virtualFeed === "stories" ? (
          selectedStoryId ? (
            <StoryDetail
              key={selectedStoryId}
              storyId={selectedStoryId}
              reloadKey={storiesReloadKey}
              onClose={layout.isMobile ? layout.goToList : undefined}
              onDeleted={(deletedId) => {
                if (selectedStoryId === deletedId) setSelectedStoryId(null)
                setStoriesReloadKey((k) => k + 1)
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a story to see its timeline.
            </div>
          )
        ) : (
          <EntryContent
            entry={selectedEntry}
            onToggleRead={() => selectedEntry && handleToggleRead(selectedEntry.id)}
            onToggleStarred={() => selectedEntry && handleToggleStarredEntry(selectedEntry.id)}
            onTogglePublished={() => selectedEntry && handleTogglePublishedEntry(selectedEntry.id)}
            onScoreChange={(score) => selectedEntry && handleSetScore(selectedEntry.id, score)}
            onPrevious={handleKeyboardPrevious}
            onNext={handleKeyboardNext}
            hasPrevious={currentIndex > 0}
            hasNext={currentIndex < entries.length - 1}
            isLoading={isLoadingEntry}
            scrollViewportRef={contentScrollRef}
            onUpdateNote={handleUpdateNote}
            showIframe={showIframe}
            onToggleIframe={toggleIframe}
            allTags={allTags}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            focusMode={focusMode}
            onToggleFocusMode={handleToggleFocusMode}
            onCopyLink={handleKeyboardCopyLink}
            copyLinkStatus={copyLinkStatus}
            listTitle={getListTitle()}
            entryIndex={currentIndex}
            entryCount={entries.length}
            onBack={layout.isMobile ? layout.goToList : undefined}
            onFollowStoryCreated={handleFollowStoryCreated}
          />
        )}
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

function AuthenticatedApp() {
  const { isLoading, isAuthenticated } = useAuth()

  // Above the early returns because the rules of hooks say so, and gated on
  // isAuthenticated because ApplicationCable::Connection rejects a socket with
  // no session: opening one from the login screen would only ever be refused.
  useCableHeartbeat(isAuthenticated)

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <PreferencesProvider>
      <LayoutProvider>
        <AudioPlayerProvider>
          <App />
        </AudioPlayerProvider>
      </LayoutProvider>
    </PreferencesProvider>
  )
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("react-root")
  if (container) {
    const root = createRoot(container)
    root.render(
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <AuthenticatedApp />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    )
  }
})
