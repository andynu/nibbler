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
  caption?: string  // Deprecated: use name instead
  fg_color: string
  bg_color: string
  entry_count: number
}

// Deprecated: use Tag instead
export type Label = Tag

export interface PaginatedEntries {
  entries: Entry[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
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

export type FilterRuleType = "title" | "content" | "both" | "link" | "date" | "author" | "tag"
export type FilterActionType = "delete" | "mark_read" | "star" | "tag" | "publish" | "score" | "label" | "stop" | "ignore_tag"

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
  status: "ready" | "generating"
  audio_url?: string
  duration?: number
  timestamps?: WordTimestamp[]
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
      view?: "fresh" | "starred" | "published" | "archived"
      order_by?: "date" | "score"
      sort?: string // Multi-column sort: "date:desc,feed:asc"
      page?: number
      per_page?: number
      fresh_max_age?: "week" | "month" | "all"
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
    list: () =>
      request<{ tags: string[]; tags_with_counts: Array<{ name: string; count: number }> }>("/tags"),
  },

  entryTags: {
    add: (entryId: number, tagName: string) =>
      request<{ entry_id: number; tags: string[] }>(`/entries/${entryId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_name: tagName }),
      }),
    addMultiple: (entryId: number, tagNames: string[]) =>
      request<{ entry_id: number; tags: string[] }>(`/entries/${entryId}/tags`, {
        method: "POST",
        body: JSON.stringify({ tag_names: tagNames }),
      }),
    remove: (entryId: number, tagName: string) =>
      request<{ entry_id: number; tags: string[] }>(`/entries/${entryId}/tags/${encodeURIComponent(tagName)}`, {
        method: "DELETE",
      }),
  },

  labels: {
    list: () => request<Label[]>("/labels"),
    get: (id: number) => request<Label>(`/labels/${id}`),
    create: (data: { label: { caption: string; fg_color?: string; bg_color?: string } }) =>
      request<Label>("/labels", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { label: { caption?: string; fg_color?: string; bg_color?: string } }) =>
      request<Label>(`/labels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request<void>(`/labels/${id}`, { method: "DELETE" }),
  },

  entryLabels: {
    add: (entryId: number, labelId: number) =>
      request<void>(`/entries/${entryId}/labels`, { method: "POST", body: JSON.stringify({ label_id: labelId }) }),
    remove: (entryId: number, labelId: number) =>
      request<void>(`/entries/${entryId}/labels/${labelId}`, { method: "DELETE" }),
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
}
