const API_BASE = "/api/v1"

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

export interface Feed {
  id: number
  title: string
  feed_url: string
  site_url: string | null
  category_id: number | null
  category_title: string | null
  icon_url: string | null
  last_updated: string | null
  last_successful_update: string | null
  next_poll_at: string | null
  last_error: string | null
  unread_count: number
  entry_count: number
  oldest_entry_date: string | null
  newest_entry_date: string | null
  update_interval?: number
}

export interface Enclosure {
  id: number
  content_url: string
  content_type: string
  title: string
  duration: string
  width: number
  height: number
}

export interface Entry {
  id: number
  entry_id: number
  feed_id: number | null
  feed_title: string | null
  title: string
  link: string
  author: string
  published: string
  unread: boolean
  starred: boolean
  is_published: boolean
  score: number
  last_read: string | null
  content_preview?: string | null
  content?: string
  note?: string
  tags?: Array<{
    id: number
    name: string
    fg_color: string
    bg_color: string
  }>
  detected_tags?: Array<{
    id: number
    name: string
  }>
  enclosures?: Enclosure[]
}

export interface Category {
  id: number
  title: string
  parent_id: number | null
  collapsed: boolean
  order_id: number
  feed_count: number
  unread_count: number
  feeds?: Feed[]
  children?: Category[]
}

export interface Tag {
  id: number
  name: string
  fg_color: string
  bg_color: string
  entry_count: number
}

/**
 * The Fresh window overrides the server accepts, from
 * FreshArticleWindow#fresh_article_cutoff_for_param. "all" means no age limit;
 * omitting the param falls back to the user's fresh_article_max_age preference.
 * Entry lists, search and the sidebar counters all read the same vocabulary, so
 * they change together whenever the server's does.
 */
export type FreshMaxAge = "week" | "month" | "all"

/**
 * The virtual folders the server recognises, from the `case params[:view]`
 * switch shared by EntriesController#index and #headlines.
 */
export type EntryView = "fresh" | "starred" | "published" | "archived"

export interface PaginatedEntries {
  entries: Entry[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}

/**
 * One search hit. Deliberately not an Entry: SearchController renders its own
 * projection, adding `snippet` and omitting score / is_published / last_read /
 * content / tags / enclosures. Components that take an Entry cannot be handed
 * a SearchResult without widening their props or a lossy conversion.
 */
export interface SearchResult {
  id: number
  entry_id: number
  feed_id: number | null
  feed_title: string | null
  title: string
  link: string
  author: string
  published: string
  unread: boolean
  starred: boolean
  snippet: string
}

export interface SearchResponse {
  query: string
  entries: SearchResult[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}

export interface SearchParams {
  q: string
  unread?: boolean
  starred?: boolean
  feed_id?: number
  category_id?: number
  view?: EntryView
  tag?: string
  fresh_max_age?: FreshMaxAge
  fresh_per_feed?: number
  page?: number
  per_page?: number
}

export interface FeedPreview {
  title: string
  site_url: string | null
  feed_url: string
  entry_count: number
  last_updated: string | null
  sample_entries: Array<{ title: string; published: string | null }>
}

export interface FeedInfo {
  id: number
  title: string
  feed_url: string
  site_url: string | null
  icon_url: string | null
  category_title: string | null

  // Sync info
  last_updated: string | null
  last_successful_update: string | null
  next_poll_at: string | null
  etag: string | null
  last_modified: string | null
  last_error: string | null

  // Polling interval
  update_interval: number | null
  calculated_interval_seconds: number | null
  avg_posts_per_day: number | null

  // Entry stats
  entry_count: number
  oldest_entry_date: string | null
  newest_entry_date: string | null
  posts_per_day: number

  // Frequency data for chart
  frequency_by_hour: Record<number, number>
  frequency_by_day: Record<number, number>

  // Word frequency for categorization hints
  top_words: Array<{ word: string; count: number }>
}

export interface EntryInfo {
  top_words: Array<{ word: string; count: number }>
}

/**
 * Whether the entry's page will render inside an iframe, read from its own
 * response headers by the server. "unknown" means the site could not be asked.
 * See EmbedPolicyProbe for why the browser cannot work this out itself.
 */
export interface EmbedPolicy {
  status: "embeddable" | "blocked" | "unknown"
  reason: string | null
}

export interface User {
  id: number
  login: string
  email: string
  full_name: string | null
  access_level: number
  is_admin: boolean
  last_login: string | null
}

export interface Preferences {
  show_content_preview: string
  strip_images: string
  content_view_mode: string
  default_update_interval: string
  confirm_feed_catchup: string
  default_view_mode: string
  default_view_limit: string
  fresh_article_max_age: string
  date_format: string
  hide_read_feeds: string
  hide_read_shows_special: string
  feeds_sort_by_unread: string
  entries_sort_by_score: string
  entries_sort_config: string // Multi-column sort: "date:desc,feed:asc"
  entries_hide_read: string
  entries_hide_unstarred: string
  entries_display_density: string
  purge_old_days: string
  purge_unread_articles: string
  theme: string
  accent_hue: string
  sidebar_collapsed: string
  sync_to_tree: string
  user_language: string
  tts_playback_speed: string
  // Email digest preferences
  digest_enable: string
  digest_preferred_time: string
  digest_catchup: string
  digest_min_score: string
}

export interface StoryLatestAnalysis {
  timeline_label: string | null
  new_development: boolean
  created_at: string
}

export interface Story {
  id: number
  name: string
  queries: string[]
  summary: string | null
  status: "active" | "concluded"
  source_entry_id: number | null
  concluded_at: string | null
  wrapup: string | null
  wrapup_generated_at: string | null
  created_at: string
  // Present on index responses; absent on show.
  latest_analysis?: StoryLatestAnalysis | null
  updated_at?: string
}

export interface StoryWrapupResponse {
  wrapup: string
  wrapup_generated_at: string
}

export interface StoryAnalysis {
  id: number
  new_development: boolean
  concluded: boolean
  timeline_label: string | null
  summary: string | null
  rationale: string | null
  article_ids: number[]
  created_at: string
}

export interface StoryArticle {
  id: number
  url: string
  title: string | null
  snippet: string | null
  source: string | null
  published_at: string | null
  fetched_at: string | null
}

export interface StoryDetail extends Story {
  analyses: StoryAnalysis[]
  articles: StoryArticle[]
}

export interface StoryExtraction {
  topic: string
  queries: string[]
  source_entry_id: number
}

export type FilterRuleType = "title" | "content" | "both" | "link" | "date" | "author" | "tag"
export type FilterActionType = "delete" | "mark_read" | "star" | "tag" | "publish" | "score" | "stop" | "ignore_tag"

export interface FilterRule {
  id?: number
  filter_type: FilterRuleType
  reg_exp: string
  inverse: boolean
  feed_id: number | null
  category_id: number | null
  cat_filter: boolean
  match_on: string | null
  _destroy?: boolean
}

export interface FilterAction {
  id?: number
  action_type: FilterActionType
  action_param: string | null
  _destroy?: boolean
}

export interface Filter {
  id: number
  title: string
  enabled: boolean
  match_any_rule: boolean
  inverse: boolean
  order_id: number
  last_triggered: string | null
  rules: FilterRule[]
  actions: FilterAction[]
}

export interface FilterTestResult {
  total_tested: number
  matches: number
  matched_articles: Array<{ id: number; title: string }>
}

export interface FilterBackfillResult {
  affected_count: number
}

export interface WordTimestamp {
  word: string
  start: number
  end: number
}

export interface AudioResponse {
  status: "ready" | "generating" | "error" | "unavailable"
  audio_url?: string
  duration?: number
  timestamps?: WordTimestamp[]
  error?: string
}

export type AudioSource = "tts" | "podcast"

export interface QueueItem {
  id: string              // crypto.randomUUID()
  entryId: number
  entryTitle: string
  feedTitle?: string
  source: AudioSource
  audioUrl?: string       // for podcasts; TTS fetched when needed
  duration?: number
  status: "pending" | "generating" | "ready" | "error"
}

export type FilterRuleCreateData = {
  filter_type: FilterRuleType
  reg_exp: string
  inverse?: boolean
  feed_id?: number | null
  category_id?: number | null
}

export type FilterRuleUpdateData =
  | { id?: number; filter_type: FilterRuleType; reg_exp: string; inverse?: boolean; feed_id?: number | null; category_id?: number | null }
  | { id: number; _destroy: true }

export type FilterActionCreateData = {
  action_type: FilterActionType
  action_param?: string | null
}

export type FilterActionUpdateData =
  | { id?: number; action_type: FilterActionType; action_param?: string | null }
  | { id: number; _destroy: true }

export interface FilterCreateData {
  title: string
  enabled?: boolean
  match_any_rule?: boolean
  inverse?: boolean
  order_id?: number
  filter_rules_attributes?: FilterRuleCreateData[]
  filter_actions_attributes?: FilterActionCreateData[]
}

export interface FilterUpdateData {
  title?: string
  enabled?: boolean
  match_any_rule?: boolean
  inverse?: boolean
  order_id?: number
  filter_rules_attributes?: FilterRuleUpdateData[]
  filter_actions_attributes?: FilterActionUpdateData[]
}

// Sorting configuration for multi-column sorting
export type SortColumn = "date" | "published" | "feed" | "title" | "score" | "unread"
export type SortDirection = "asc" | "desc"

export interface SortConfig {
  column: SortColumn
  direction: SortDirection
}

// Convert SortConfig array to API parameter string
export function sortConfigToParam(configs: SortConfig[]): string {
  return configs.map((c) => `${c.column}:${c.direction}`).join(",")
}

// Parse API parameter string to SortConfig array
export function paramToSortConfig(param: string): SortConfig[] {
  if (!param) return []
  return param.split(",").map((part) => {
    const [column, direction] = part.split(":")
    return {
      column: column as SortColumn,
      direction: (direction || "desc") as SortDirection,
    }
  })
}

export const api = {
  feeds: {
    list: () => request<Feed[]>("/feeds"),
    get: (id: number) => request<Feed & { entries: Entry[] }>(`/feeds/${id}`),
    create: (data: { feed: { title?: string; feed_url: string; category_id?: number } }) =>
      request<Feed>("/feeds", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { feed: Partial<Feed> }) =>
      request<Feed>(`/feeds/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/feeds/${id}`, { method: "DELETE" }),
    refresh: (id: number) =>
      request<{ status: string; new_entries: number; feed: Feed }>(`/feeds/${id}/refresh`, { method: "POST" }),
    refreshAll: () =>
      request<{ updated: number; results: Array<{ feed_id: number; title: string; status: string; new_entries: number; error: string | null }> }>("/feeds/refresh_all", { method: "POST" }),
    preview: (url: string) =>
      request<FeedPreview>("/feeds/preview", { method: "POST", body: JSON.stringify({ url }) }),
    info: (id: number) => request<FeedInfo>(`/feeds/${id}/info`),
  },

  entries: {
    list: (params?: {
      unread?: boolean
      starred?: boolean
      feed_id?: number
      category_id?: number
      view?: EntryView
      order_by?: "date" | "score"
      sort?: string // Multi-column sort: "date:desc,feed:asc"
      page?: number
      per_page?: number
      fresh_max_age?: FreshMaxAge
      fresh_per_feed?: number
      tag?: string
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.unread !== undefined) searchParams.set("unread", String(params.unread))
      if (params?.starred !== undefined) searchParams.set("starred", String(params.starred))
      if (params?.feed_id) searchParams.set("feed_id", String(params.feed_id))
      if (params?.category_id) searchParams.set("category_id", String(params.category_id))
      if (params?.view) searchParams.set("view", params.view)
      if (params?.sort) searchParams.set("sort", params.sort)
      else if (params?.order_by) searchParams.set("order_by", params.order_by)
      if (params?.page) searchParams.set("page", String(params.page))
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
      if (params?.fresh_max_age) searchParams.set("fresh_max_age", params.fresh_max_age)
      if (params?.fresh_per_feed) searchParams.set("fresh_per_feed", String(params.fresh_per_feed))
      if (params?.tag) searchParams.set("tag", params.tag)
      const query = searchParams.toString()
      return request<PaginatedEntries>(`/entries${query ? `?${query}` : ""}`)
    },
    get: (id: number) => request<Entry>(`/entries/${id}`),
    update: (id: number, data: { entry: Partial<Entry> }) =>
      request<Entry>(`/entries/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    toggleRead: (id: number) =>
      request<{ id: number; unread: boolean }>(`/entries/${id}/toggle_read`, { method: "POST" }),
    toggleStarred: (id: number) =>
      request<{ id: number; starred: boolean }>(`/entries/${id}/toggle_starred`, { method: "POST" }),
    togglePublished: (id: number) =>
      request<{ id: number; is_published: boolean }>(`/entries/${id}/toggle_published`, { method: "POST" }),
    markAllRead: (params?: { feed_id?: number; category_id?: number }) =>
      request<{ marked_read: number }>("/entries/mark_all_read", {
        method: "POST",
        body: JSON.stringify(params || {}),
      }),
    audio: (id: number) =>
      request<AudioResponse>(`/entries/${id}/audio`),
    keywords: (params?: { feed_id?: number; category_id?: number; limit?: number; entry_limit?: number }) => {
      const searchParams = new URLSearchParams()
      if (params?.feed_id) searchParams.set("feed_id", String(params.feed_id))
      if (params?.category_id) searchParams.set("category_id", String(params.category_id))
      if (params?.limit) searchParams.set("limit", String(params.limit))
      if (params?.entry_limit) searchParams.set("entry_limit", String(params.entry_limit))
      const query = searchParams.toString()
      return request<{ keywords: Array<{ word: string; count: number }> }>(`/entries/keywords${query ? `?${query}` : ""}`)
    },
    info: (id: number) => request<EntryInfo>(`/entries/${id}/info`),
    embedPolicy: (id: number) => request<EmbedPolicy>(`/entries/${id}/embed_policy`),
  },

  /**
   * GET /api/v1/search. Takes the same scoping params as api.entries.list so a
   * search can be narrowed to the list the user is already looking at.
   *
   * Every param here is honoured server-side: SearchController reads them
   * through the same EntryScoping concern the entry list uses, so results are
   * the intersection of the query and the list, not a second opinion about what
   * that list holds. category_id covers the category's whole subtree, and
   * view: "fresh" applies both fresh_max_age and the fresh_per_feed cap.
   *
   * Results come back ranked by relevance, with entries.date_entered DESC as
   * the tiebreak. The sort/order_by params api.entries.list accepts have no
   * meaning here and are not sent.
   */
  search: (params: SearchParams): Promise<SearchResponse> => {
    const q = params.q.trim()
    // A blank query has no answer worth a round trip. The server renders this
    // same empty envelope for a blank q, so callers see one shape either way.
    if (!q) {
      return Promise.resolve({
        query: "",
        entries: [],
        pagination: { page: 1, per_page: 50, total: 0, total_pages: 0 },
      })
    }

    const searchParams = new URLSearchParams()
    searchParams.set("q", q)
    if (params.unread !== undefined) searchParams.set("unread", String(params.unread))
    if (params.starred !== undefined) searchParams.set("starred", String(params.starred))
    if (params.feed_id) searchParams.set("feed_id", String(params.feed_id))
    if (params.category_id) searchParams.set("category_id", String(params.category_id))
    if (params.view) searchParams.set("view", params.view)
    if (params.tag) searchParams.set("tag", params.tag)
    if (params.fresh_max_age) searchParams.set("fresh_max_age", params.fresh_max_age)
    if (params.fresh_per_feed) searchParams.set("fresh_per_feed", String(params.fresh_per_feed))
    if (params.page) searchParams.set("page", String(params.page))
    if (params.per_page) searchParams.set("per_page", String(params.per_page))
    return request<SearchResponse>(`/search?${searchParams.toString()}`)
  },

  categories: {
    list: () => request<Category[]>("/categories"),
    tree: () => request<Category[]>("/categories/tree"),
    get: (id: number) => request<Category>(`/categories/${id}`),
    create: (data: { category: { title: string; parent_id?: number } }) =>
      request<Category>("/categories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { category: Partial<Category> }) =>
      request<Category>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/categories/${id}`, { method: "DELETE" }),
  },

  preferences: {
    get: () => request<Preferences>("/preferences"),
    update: (data: Partial<Preferences>) =>
      request<Preferences>("/preferences", { method: "PATCH", body: JSON.stringify(data) }),
  },

  filters: {
    list: () => request<Filter[]>("/filters"),
    get: (id: number) => request<Filter>(`/filters/${id}`),
    create: (data: { filter: FilterCreateData }) =>
      request<Filter>("/filters", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { filter: FilterUpdateData }) =>
      request<Filter>(`/filters/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/filters/${id}`, { method: "DELETE" }),
    test: (id: number) => request<FilterTestResult>(`/filters/${id}/test`, { method: "POST" }),
    backfill: (id: number) =>
      request<FilterBackfillResult>(`/filters/${id}/backfill`, { method: "POST" }),
  },

  tags: {
    list: () => request<Tag[]>("/tags"),
    get: (id: number) => request<Tag>(`/tags/${id}`),
    create: (data: { tag: { name: string; fg_color?: string; bg_color?: string } }) =>
      request<Tag>("/tags", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { tag: { name?: string; fg_color?: string; bg_color?: string } }) =>
      request<Tag>(`/tags/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/tags/${id}`, { method: "DELETE" }),
  },

  entryTags: {
    add: (entryId: number, tagName: string) =>
      request<{ entry_id: number; tags: Array<{ id: number; name: string; fg_color: string; bg_color: string }> }>(`/entries/${entryId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_name: tagName }),
      }),
    addMultiple: (entryId: number, tagNames: string[]) =>
      request<{ entry_id: number; tags: Array<{ id: number; name: string; fg_color: string; bg_color: string }> }>(`/entries/${entryId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_names: tagNames }),
      }),
    remove: (entryId: number, tagName: string) =>
      request<{ entry_id: number; tags: Array<{ id: number; name: string; fg_color: string; bg_color: string }> }>(`/entries/${entryId}/tags/${encodeURIComponent(tagName)}`, {
        method: "DELETE",
      }),
  },

  stories: {
    list: () => request<Story[]>("/stories"),
    get: (id: number) => request<StoryDetail>(`/stories/${id}`),
    extractFromEntry: (entryId: number) =>
      request<StoryExtraction>("/stories/extract_from_entry", {
        method: "POST",
        body: JSON.stringify({ entry_id: entryId }),
      }),
    create: (data: { story: { name: string; queries: string[]; source_entry_id?: number } }) =>
      request<Story>("/stories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { story: Partial<Pick<Story, "name" | "queries" | "status">> }) =>
      request<Story>(`/stories/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/stories/${id}`, { method: "DELETE" }),
    generateWrapup: (id: number) =>
      request<StoryWrapupResponse>(`/stories/${id}/wrapup`, { method: "POST" }),
    fetch: (id: number) =>
      request<{ status: string; story_id: number }>(`/stories/${id}/fetch`, { method: "POST" }),
  },

  counters: {
    // fresh_max_age and fresh_per_feed mirror the Fresh view's own selectors so
    // the sidebar badge counts the same rows the list shows.
    get: (params?: { fresh_max_age?: FreshMaxAge; fresh_per_feed?: number }) => {
      const searchParams = new URLSearchParams()
      if (params?.fresh_max_age) searchParams.set("fresh_max_age", params.fresh_max_age)
      if (params?.fresh_per_feed) searchParams.set("fresh_per_feed", String(params.fresh_per_feed))
      const query = searchParams.toString()
      return request<{
        feeds: Record<number, number>
        categories: Record<number, number>
        virtual: {
          all: number
          fresh: number
          starred: number
          published: number
        }
        total: number
      }>(`/counters${query ? `?${query}` : ""}`)
    },
  },

  opml: {
    preview: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch(`${API_BASE}/opml/preview`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `HTTP ${response.status}`)
      }
      return response.json() as Promise<{
        feeds: Array<{
          title: string
          feed_url: string
          site_url: string
          category_path: string
          exists: boolean
        }>
        total: number
        new_feeds: number
        existing_feeds: number
        errors: string[]
      }>
    },
    import: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch(`${API_BASE}/opml/import`, {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.error || `HTTP ${response.status}`)
      }
      return response.json() as Promise<{
        success: boolean
        summary: string
        feeds_created: number
        feeds_skipped: number
        categories_created: number
        errors?: string[]
      }>
    },
    exportUrl: () => `${API_BASE}/opml/export`,
  },

  auth: {
    login: (login: string, password: string) =>
      request<User>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      }),
    logout: () => request<void>("/auth/logout", { method: "DELETE" }),
    me: () => request<User>("/auth/me"),
    publicFeedKey: () =>
      request<{ access_key: string; feed_url: string }>("/auth/public_feed_key"),
    regeneratePublicFeedKey: () =>
      request<{ access_key: string; feed_url: string }>("/auth/regenerate_public_feed_key", {
        method: "POST",
      }),
  },
}
