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
  last_error: string | null
  unread_count: number
  update_interval?: number
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
  labels?: Array<{
    id: number
    caption: string
    fg_color: string
    bg_color: string
  }>
  tags?: string[]
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

export interface PaginatedEntries {
  entries: Entry[]
  pagination: {
    page: number
    per_page: number
    total: number
    total_pages: number
  }
}

export interface Preferences {
  show_content_preview: string
  strip_images: string
  default_update_interval: string
  confirm_feed_catchup: string
  default_view_mode: string
  default_view_limit: string
  fresh_article_max_age: string
  date_format: string
}

export type FilterRuleType = "title" | "content" | "both" | "link" | "date" | "author" | "tag"
export type FilterActionType = "delete" | "mark_read" | "star" | "tag" | "publish" | "score" | "label" | "stop" | "ignore_tag"

export interface FilterRule {
  id?: number
  filter_type: number
  filter_type_name: FilterRuleType
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
  action_type: number
  action_type_name: FilterActionType
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

export type FilterRuleCreateData = {
  filter_type: number
  reg_exp: string
  inverse?: boolean
  feed_id?: number | null
  category_id?: number | null
}

export type FilterRuleUpdateData =
  | { id?: number; filter_type: number; reg_exp: string; inverse?: boolean; feed_id?: number | null; category_id?: number | null }
  | { id: number; _destroy: true }

export type FilterActionCreateData = {
  action_type: number
  action_param?: string | null
}

export type FilterActionUpdateData =
  | { id?: number; action_type: number; action_param?: string | null }
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
  },

  entries: {
    list: (params?: {
      unread?: boolean
      starred?: boolean
      feed_id?: number
      category_id?: number
      view?: "fresh" | "starred" | "published" | "archived"
      page?: number
      per_page?: number
    }) => {
      const searchParams = new URLSearchParams()
      if (params?.unread !== undefined) searchParams.set("unread", String(params.unread))
      if (params?.starred !== undefined) searchParams.set("starred", String(params.starred))
      if (params?.feed_id) searchParams.set("feed_id", String(params.feed_id))
      if (params?.category_id) searchParams.set("category_id", String(params.category_id))
      if (params?.view) searchParams.set("view", params.view)
      if (params?.page) searchParams.set("page", String(params.page))
      if (params?.per_page) searchParams.set("per_page", String(params.per_page))
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
  },
}
