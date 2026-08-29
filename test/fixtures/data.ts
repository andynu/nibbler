import type {
  Feed,
  Entry,
  Category,
  Tag,
  Filter,
  FilterRule,
  FilterAction,
  Preferences,
  PaginatedEntries,
  SearchResult,
  SearchResponse,
} from "@/lib/api"

export function mockFeed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: 1,
    title: "Test Feed",
    feed_url: "https://example.com/feed.xml",
    site_url: "https://example.com",
    category_id: null,
    category_title: null,
    icon_url: null,
    last_updated: "2025-01-15T10:00:00Z",
    last_successful_update: "2025-01-15T10:00:00Z",
    next_poll_at: "2025-01-15T11:00:00Z",
    last_error: null,
    unread_count: 5,
    entry_count: 20,
    oldest_entry_date: "2024-01-01T00:00:00Z",
    newest_entry_date: "2025-01-15T09:00:00Z",
    ...overrides,
  }
}

export function mockEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    entry_id: 100,
    feed_id: 1,
    feed_title: "Test Feed",
    title: "Test Entry",
    link: "https://example.com/article",
    author: "Test Author",
    published: "2025-01-15T10:00:00Z",
    unread: true,
    starred: false,
    is_published: false,
    score: 0,
    last_read: null,
    content_preview: "This is a test entry preview...",
    ...overrides,
  }
}

export function mockEntryWithContent(overrides: Partial<Entry> = {}): Entry {
  return {
    ...mockEntry(),
    content: "<p>This is the full content of the test entry.</p>",
    note: undefined,
    tags: [],
    enclosures: [],
    ...overrides,
  }
}

export function mockCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 1,
    title: "Test Category",
    parent_id: null,
    collapsed: false,
    order_id: 0,
    feed_count: 3,
    unread_count: 10,
    ...overrides,
  }
}

export function mockCategoryWithChildren(
  overrides: Partial<Category> = {}
): Category {
  return {
    ...mockCategory(),
    children: [
      mockCategory({ id: 2, title: "Child Category", parent_id: 1 }),
    ],
    feeds: [mockFeed({ category_id: 1 })],
    ...overrides,
  }
}

export function mockTag(overrides: Partial<Tag> = {}): Tag {
  return {
    id: 1,
    name: "Important",
    fg_color: "#ffffff",
    bg_color: "#ff0000",
    entry_count: 5,
    ...overrides,
  }
}

export function mockFilterRule(
  overrides: Partial<FilterRule> = {}
): FilterRule {
  return {
    id: 1,
    filter_type: "title",
    reg_exp: "test",
    inverse: false,
    feed_id: null,
    category_id: null,
    cat_filter: false,
    match_on: null,
    ...overrides,
  }
}

export function mockFilterAction(
  overrides: Partial<FilterAction> = {}
): FilterAction {
  return {
    id: 1,
    action_type: "mark_read",
    action_param: null,
    ...overrides,
  }
}

export function mockFilter(overrides: Partial<Filter> = {}): Filter {
  return {
    id: 1,
    title: "Test Filter",
    enabled: true,
    match_any_rule: false,
    inverse: false,
    order_id: 0,
    last_triggered: null,
    rules: [mockFilterRule()],
    actions: [mockFilterAction()],
    ...overrides,
  }
}

export function mockPreferences(
  overrides: Partial<Preferences> = {}
): Preferences {
  return {
    show_content_preview: "true",
    strip_images: "false",
    content_view_mode: "rss",
    default_update_interval: "900",
    confirm_feed_catchup: "true",
    default_view_mode: "unread",
    default_view_limit: "50",
    fresh_article_max_age: "24",
    date_format: "relative",
    hide_read_feeds: "false",
    hide_read_shows_special: "true",
    feeds_sort_by_unread: "false",
    entries_sort_by_score: "false",
    entries_hide_read: "false",
    entries_hide_unstarred: "false",
    entries_display_density: "medium",
    purge_old_days: "30",
    purge_unread_articles: "false",
    theme: "system",
    accent_hue: "200",
    sidebar_collapsed: "false",
    sync_to_tree: "false",
    user_language: "",
    entries_sort_config: "date:desc",
    tts_playback_speed: "1",
    digest_enable: "false",
    digest_preferred_time: "08:00",
    digest_catchup: "false",
    digest_min_score: "0",
    ...overrides,
  }
}

export function mockPaginatedEntries(
  entries: Entry[] = [mockEntry()],
  pagination: Partial<PaginatedEntries["pagination"]> = {}
): PaginatedEntries {
  return {
    entries,
    pagination: {
      page: 1,
      per_page: 50,
      total: entries.length,
      total_pages: 1,
      ...pagination,
    },
  }
}

export function mockSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    id: 1,
    entry_id: 100,
    feed_id: 1,
    feed_title: "Test Feed",
    title: "Test Entry",
    link: "https://example.com/article",
    author: "Test Author",
    published: "2025-01-15T10:00:00Z",
    unread: true,
    starred: false,
    snippet: "...a test entry that mentions the search term...",
    ...overrides,
  }
}

export function mockSearchResponse(
  entries: SearchResult[] = [mockSearchResult()],
  overrides: Partial<SearchResponse> = {}
): SearchResponse {
  return {
    query: "test",
    entries,
    pagination: {
      page: 1,
      per_page: 50,
      total: entries.length,
      total_pages: 1,
    },
    ...overrides,
  }
}
