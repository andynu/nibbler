import { useState, useEffect } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogPortal,
} from "@/components/ui/dialog"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import {
  api,
  Filter,
  Feed,
  Category,
  FilterRuleUpdateData,
  FilterActionUpdateData,
  FilterUpdateData,
  FilterActionType,
} from "@/lib/api"
import { Plus, Pencil, Trash2, GripVertical, Play, X, RotateCcw } from "lucide-react"

const FILTER_TYPES = [
  { value: 1, label: "Title", name: "title" },
  { value: 2, label: "Content", name: "content" },
  { value: 3, label: "Title or Content", name: "both" },
  { value: 4, label: "Link URL", name: "link" },
  { value: 5, label: "Date", name: "date" },
  { value: 6, label: "Author", name: "author" },
  { value: 7, label: "Tags", name: "tag" },
]

const ACTION_TYPES = [
  { value: "mark_read", label: "Mark as read" },
  { value: "star", label: "Star article" },
  { value: "tag", label: "Add tag", hasParam: true },
  { value: "score", label: "Adjust score", hasParam: true },
  { value: "label", label: "Apply label", hasParam: true },
  { value: "delete", label: "Delete article" },
  { value: "stop", label: "Stop processing" },
]

interface RuleFormData {
  id?: number
  filter_type: number
  reg_exp: string
  inverse: boolean
  feed_id: number | null
  category_id: number | null
}

interface ActionFormData {
  id?: number
  action_type: FilterActionType
  action_param: string
}

interface FilterFormData {
  title: string
  enabled: boolean
  match_any_rule: boolean
  inverse: boolean
  rules: RuleFormData[]
  actions: ActionFormData[]
}

interface FilterManagerProps {
  feeds: Feed[]
  categories: Category[]
}

export function FilterManager({ feeds, categories }: FilterManagerProps) {
  const [filters, setFilters] = useState<Filter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingFilter, setEditingFilter] = useState<Filter | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [testResult, setTestResult] = useState<{
    filterId: number
    matches: number
    total: number
  } | null>(null)
  const [backfillResult, setBackfillResult] = useState<{
    filterId: number
    affectedCount: number
  } | null>(null)
  const [backfillInProgress, setBackfillInProgress] = useState<number | null>(null)
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [availableLabels, setAvailableLabels] = useState<Array<{ id: number; caption: string }>>([])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  useEffect(() => {
    loadFilters()
    loadTagsAndLabels()
  }, [])

  const loadTagsAndLabels = async () => {
    try {
      const [tagsData, labelsData] = await Promise.all([
        api.tags.list(),
        api.labels.list(),
      ])
      setAvailableTags(tagsData.tags)
      setAvailableLabels(labelsData.map((l) => ({ id: l.id, caption: l.name || l.caption })))
    } catch (error) {
      console.error("Failed to load tags/labels:", error)
    }
  }

  const loadFilters = async () => {
    try {
      const data = await api.filters.list()
      setFilters(data)
    } catch (error) {
      console.error("Failed to load filters:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    const oldIndex = filters.findIndex((f) => f.id === Number(active.id))
    const newIndex = filters.findIndex((f) => f.id === Number(over.id))

    if (oldIndex === -1 || newIndex === -1) return

    // Optimistically update the UI
    const newFilters = arrayMove(filters, oldIndex, newIndex)
    setFilters(newFilters)

    // Update order_id for all affected filters
    try {
      await Promise.all(
        newFilters.map((filter, index) =>
          api.filters.update(filter.id, {
            filter: { order_id: index },
          })
        )
      )
    } catch (error) {
      console.error("Failed to update filter order:", error)
      // Revert on error
      loadFilters()
    }
  }

  const handleToggleEnabled = async (filter: Filter) => {
    try {
      const updated = await api.filters.update(filter.id, {
        filter: { enabled: !filter.enabled },
      })
      setFilters((prev) =>
        prev.map((f) => (f.id === updated.id ? updated : f))
      )
    } catch (error) {
      console.error("Failed to toggle filter:", error)
    }
  }

  const handleDelete = async (filterId: number) => {
    if (!confirm("Are you sure you want to delete this filter?")) return

    try {
      await api.filters.delete(filterId)
      setFilters((prev) => prev.filter((f) => f.id !== filterId))
    } catch (error) {
      console.error("Failed to delete filter:", error)
    }
  }

  const handleTest = async (filterId: number) => {
    try {
      const result = await api.filters.test(filterId)
      setTestResult({
        filterId,
        matches: result.matches,
        total: result.total_tested,
      })
      setTimeout(() => setTestResult(null), 3000)
    } catch (error) {
      console.error("Failed to test filter:", error)
    }
  }

  const handleBackfill = async (filterId: number) => {
    setBackfillInProgress(filterId)
    setBackfillResult(null)
    try {
      const result = await api.filters.backfill(filterId)
      setBackfillResult({
        filterId,
        affectedCount: result.affected_count,
      })
      setTimeout(() => setBackfillResult(null), 5000)
    } catch (error) {
      console.error("Failed to backfill filter:", error)
    } finally {
      setBackfillInProgress(null)
    }
  }

  const getFilterTypeName = (typeValue: number) => {
    return FILTER_TYPES.find((t) => t.value === typeValue)?.label || "Unknown"
  }

  const getActionTypeName = (typeValue: FilterActionType) => {
    return ACTION_TYPES.find((t) => t.value === typeValue)?.label || "Unknown"
  }

  if (isLoading) {
    return (
      <div className="p-4 text-muted-foreground">Loading filters...</div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-medium">Article Filters</h3>
          <p className="text-sm text-muted-foreground">
            Automatically process articles based on rules
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Filter
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {filters.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No filters yet.</p>
            <p className="text-sm mt-1">
              Create filters to automatically process incoming articles.
            </p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filters.map((f) => f.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y">
                {filters.map((filter) => (
                  <SortableFilterItem
                    key={filter.id}
                    filter={filter}
                    testResult={testResult}
                    backfillResult={backfillResult}
                    backfillInProgress={backfillInProgress}
                    getFilterTypeName={getFilterTypeName}
                    getActionTypeName={getActionTypeName}
                    onToggleEnabled={handleToggleEnabled}
                    onTest={handleTest}
                    onBackfill={handleBackfill}
                    onEdit={setEditingFilter}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>

      <FilterEditorDialog
        open={isCreating || editingFilter !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false)
            setEditingFilter(null)
          }
        }}
        filter={editingFilter}
        feeds={feeds}
        categories={categories}
        availableTags={availableTags}
        availableLabels={availableLabels}
        onSave={async (data) => {
          if (editingFilter) {
            const updated = await api.filters.update(editingFilter.id, {
              filter: data,
            })
            setFilters((prev) =>
              prev.map((f) => (f.id === updated.id ? updated : f))
            )
          } else {
            // For create, title is required
            const created = await api.filters.create({
              filter: {
                title: data.title!,
                enabled: data.enabled,
                match_any_rule: data.match_any_rule,
                inverse: data.inverse,
                filter_rules_attributes: data.filter_rules_attributes?.filter(
                  (r): r is Exclude<typeof r, { _destroy: true }> => !("_destroy" in r)
                ),
                filter_actions_attributes: data.filter_actions_attributes?.filter(
                  (a): a is Exclude<typeof a, { _destroy: true }> => !("_destroy" in a)
                ),
              },
            })
            setFilters((prev) => [...prev, created])
          }
          setIsCreating(false)
          setEditingFilter(null)
        }}
      />
    </div>
  )
}

interface FilterEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  filter: Filter | null
  feeds: Feed[]
  categories: Category[]
  availableTags: string[]
  availableLabels: Array<{ id: number; caption: string }>
  onSave: (data: FilterUpdateData) => Promise<void>
}

function FilterEditorDialog({
  open,
  onOpenChange,
  filter,
  feeds,
  categories,
  availableTags,
  availableLabels,
  onSave,
}: FilterEditorDialogProps) {
  const [form, setForm] = useState<FilterFormData>({
    title: "",
    enabled: true,
    match_any_rule: false,
    inverse: false,
    rules: [],
    actions: [],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [deletedRuleIds, setDeletedRuleIds] = useState<number[]>([])
  const [deletedActionIds, setDeletedActionIds] = useState<number[]>([])
  const [keywordSuggestions, setKeywordSuggestions] = useState<string[]>([])

  useEffect(() => {
    if (filter) {
      setForm({
        title: filter.title,
        enabled: filter.enabled,
        match_any_rule: filter.match_any_rule,
        inverse: filter.inverse,
        rules: filter.rules.map((r) => ({
          id: r.id,
          filter_type: r.filter_type,
          reg_exp: r.reg_exp,
          inverse: r.inverse,
          feed_id: r.feed_id,
          category_id: r.category_id,
        })),
        actions: filter.actions.map((a) => ({
          id: a.id,
          action_type: a.action_type,
          action_param: a.action_param || "",
        })),
      })
      setDeletedRuleIds([])
      setDeletedActionIds([])
    } else {
      setForm({
        title: "",
        enabled: true,
        match_any_rule: false,
        inverse: false,
        rules: [
          {
            filter_type: 1,
            reg_exp: "",
            inverse: false,
            feed_id: null,
            category_id: null,
          },
        ],
        actions: [{ action_type: "mark_read", action_param: "" }],
      })
      setDeletedRuleIds([])
      setDeletedActionIds([])
    }
  }, [filter, open])

  // Load keyword suggestions based on filter rules' feed/category context
  useEffect(() => {
    if (!open) return

    // Get unique feed and category IDs from rules
    const feedIds = form.rules.map((r) => r.feed_id).filter((id): id is number => id !== null)
    const categoryIds = form.rules.map((r) => r.category_id).filter((id): id is number => id !== null)

    // Load keywords for each unique context
    const loadKeywords = async () => {
      try {
        const keywordPromises: Promise<{ keywords: Array<{ word: string; count: number }> }>[] = []

        // Add keyword requests for feeds
        feedIds.forEach((feedId) => {
          keywordPromises.push(api.entries.keywords({ feed_id: feedId, limit: 10 }))
        })

        // Add keyword requests for categories
        categoryIds.forEach((categoryId) => {
          keywordPromises.push(api.entries.keywords({ category_id: categoryId, limit: 10 }))
        })

        // If no specific context, load general keywords
        if (keywordPromises.length === 0) {
          keywordPromises.push(api.entries.keywords({ limit: 10 }))
        }

        const results = await Promise.all(keywordPromises)
        const allKeywords = new Set<string>()
        results.forEach((result) => {
          result.keywords.forEach((k) => allKeywords.add(k.word))
        })
        setKeywordSuggestions(Array.from(allKeywords))
      } catch (error) {
        console.error("Failed to load keyword suggestions:", error)
      }
    }

    loadKeywords()
  }, [open, form.rules])

  const handleAddRule = () => {
    setForm((prev) => ({
      ...prev,
      rules: [
        ...prev.rules,
        {
          filter_type: 1,
          reg_exp: "",
          inverse: false,
          feed_id: null,
          category_id: null,
        },
      ],
    }))
  }

  const handleRemoveRule = (index: number) => {
    const rule = form.rules[index]
    if (rule.id) {
      setDeletedRuleIds((prev) => [...prev, rule.id!])
    }
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index),
    }))
  }

  const handleUpdateRule = (
    index: number,
    updates: Partial<RuleFormData>
  ) => {
    setForm((prev) => ({
      ...prev,
      rules: prev.rules.map((r, i) =>
        i === index ? { ...r, ...updates } : r
      ),
    }))
  }

  const handleAddAction = () => {
    setForm((prev) => ({
      ...prev,
      actions: [...prev.actions, { action_type: "mark_read", action_param: "" }],
    }))
  }

  const handleRemoveAction = (index: number) => {
    const action = form.actions[index]
    if (action.id) {
      setDeletedActionIds((prev) => [...prev, action.id!])
    }
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.filter((_, i) => i !== index),
    }))
  }

  const handleUpdateAction = (
    index: number,
    updates: Partial<ActionFormData>
  ) => {
    setForm((prev) => ({
      ...prev,
      actions: prev.actions.map((a, i) =>
        i === index ? { ...a, ...updates } : a
      ),
    }))
  }

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      alert("Filter name is required")
      return
    }
    if (form.rules.length === 0) {
      alert("At least one rule is required")
      return
    }
    if (form.rules.some((r) => !r.reg_exp.trim())) {
      alert("All rules must have a pattern")
      return
    }
    if (form.actions.length === 0) {
      alert("At least one action is required")
      return
    }

    setIsSaving(true)
    try {
      const ruleAttrs: FilterRuleUpdateData[] = [
        ...form.rules.map((r) => ({
          id: r.id,
          filter_type: r.filter_type,
          reg_exp: r.reg_exp,
          inverse: r.inverse,
          feed_id: r.feed_id,
          category_id: r.category_id,
        })),
        ...deletedRuleIds.map((id) => ({ id, _destroy: true as const })),
      ]
      const actionAttrs: FilterActionUpdateData[] = [
        ...form.actions.map((a) => ({
          id: a.id,
          action_type: a.action_type,
          action_param: a.action_param || "",
        })),
        ...deletedActionIds.map((id) => ({ id, _destroy: true as const })),
      ]
      await onSave({
        title: form.title,
        enabled: form.enabled,
        match_any_rule: form.match_any_rule,
        inverse: form.inverse,
        filter_rules_attributes: ruleAttrs,
        filter_actions_attributes: actionAttrs,
      })
    } catch (error) {
      console.error("Failed to save filter:", error)
      alert("Failed to save filter")
    } finally {
      setIsSaving(false)
    }
  }

  // Use a custom dialog content without overlay since we're nested inside Settings dialog
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg max-h-[85vh] overflow-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {filter ? "Edit Filter" : "Create Filter"}
            </DialogTitle>
          </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="filter-title">Filter Name</Label>
            <Input
              id="filter-title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="e.g., Mark sponsored posts as read"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="filter-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, enabled: checked }))
                }
              />
              <Label htmlFor="filter-enabled">Enabled</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Rules</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={form.match_any_rule ? "any" : "all"}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      match_any_rule: value === "any",
                    }))
                  }
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Match ALL</SelectItem>
                    <SelectItem value="any">Match ANY</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={handleAddRule}>
                  <Plus className="w-4 h-4 mr-1" />
                  Add Rule
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {form.rules.map((rule, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 p-3 border rounded-md bg-muted/30"
                >
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={rule.inverse}
                          onCheckedChange={(checked) =>
                            handleUpdateRule(index, { inverse: checked })
                          }
                        />
                        <span className="text-sm text-muted-foreground">
                          NOT
                        </span>
                      </div>

                      <Select
                        value={String(rule.filter_type)}
                        onValueChange={(value) =>
                          handleUpdateRule(index, {
                            filter_type: parseInt(value),
                          })
                        }
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FILTER_TYPES.map((type) => (
                            <SelectItem
                              key={type.value}
                              value={String(type.value)}
                            >
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <span className="text-muted-foreground">matches</span>

                      <Input
                        className="flex-1"
                        value={rule.reg_exp}
                        onChange={(e) =>
                          handleUpdateRule(index, { reg_exp: e.target.value })
                        }
                        placeholder={
                          rule.filter_type === 5
                            ? "<7d (last 7 days), >2025-01-01, 2025-01-01..2025-12-31"
                            : "Regular expression pattern"
                        }
                      />
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">in</span>
                      <Select
                        value={
                          rule.feed_id
                            ? `feed:${rule.feed_id}`
                            : rule.category_id
                              ? `cat:${rule.category_id}`
                              : "all"
                        }
                        onValueChange={(value) => {
                          if (value === "all") {
                            handleUpdateRule(index, {
                              feed_id: null,
                              category_id: null,
                            })
                          } else if (value.startsWith("feed:")) {
                            handleUpdateRule(index, {
                              feed_id: parseInt(value.replace("feed:", "")),
                              category_id: null,
                            })
                          } else if (value.startsWith("cat:")) {
                            handleUpdateRule(index, {
                              feed_id: null,
                              category_id: parseInt(value.replace("cat:", "")),
                            })
                          }
                        }}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All feeds</SelectItem>
                          {categories.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Categories</SelectLabel>
                              {categories.map((cat) => (
                                <SelectItem
                                  key={`cat:${cat.id}`}
                                  value={`cat:${cat.id}`}
                                >
                                  {cat.title}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                          {feeds.length > 0 && (
                            <SelectGroup>
                              <SelectLabel>Feeds</SelectLabel>
                              {feeds.map((feed) => (
                                <SelectItem
                                  key={`feed:${feed.id}`}
                                  value={`feed:${feed.id}`}
                                >
                                  {feed.title}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {form.rules.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRule(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Actions</Label>
              <Button variant="outline" size="sm" onClick={handleAddAction}>
                <Plus className="w-4 h-4 mr-1" />
                Add Action
              </Button>
            </div>

            <div className="space-y-2">
              {form.actions.map((action, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 border rounded-md bg-muted/30"
                >
                  <Select
                    value={action.action_type}
                    onValueChange={(value) =>
                      handleUpdateAction(index, {
                        action_type: value as FilterActionType,
                        action_param: "",
                      })
                    }
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map((type) => (
                        <SelectItem
                          key={type.value}
                          value={type.value}
                        >
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Tag action - show input with datalist for autocomplete */}
                  {action.action_type === "tag" && (
                    <>
                      <Input
                        className="flex-1"
                        value={action.action_param}
                        onChange={(e) =>
                          handleUpdateAction(index, {
                            action_param: e.target.value,
                          })
                        }
                        placeholder="Tag name (type to create or select)"
                        list={`tag-suggestions-${index}`}
                      />
                      <datalist id={`tag-suggestions-${index}`}>
                        {/* Show keyword suggestions first (content-based) */}
                        {keywordSuggestions
                          .filter((kw) => !availableTags.includes(kw))
                          .map((keyword) => (
                            <option key={`kw-${keyword}`} value={keyword} />
                          ))}
                        {/* Then existing tags */}
                        {availableTags.map((tag) => (
                          <option key={`tag-${tag}`} value={tag} />
                        ))}
                      </datalist>
                    </>
                  )}

                  {/* Label action - show select from available labels */}
                  {action.action_type === "label" && (
                    <Select
                      value={action.action_param || ""}
                      onValueChange={(value) =>
                        handleUpdateAction(index, { action_param: value })
                      }
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a label" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableLabels.map((label) => (
                          <SelectItem key={label.id} value={String(label.id)}>
                            {label.caption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Score action - show number input */}
                  {action.action_type === "score" && (
                    <Input
                      className="flex-1"
                      value={action.action_param}
                      onChange={(e) =>
                        handleUpdateAction(index, {
                          action_param: e.target.value,
                        })
                      }
                      placeholder="Score adjustment (e.g., +5 or -10)"
                    />
                  )}

                  {form.actions.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveAction(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : filter ? "Save Changes" : "Create Filter"}
          </Button>
        </DialogFooter>

        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}

interface SortableFilterItemProps {
  filter: Filter
  testResult: { filterId: number; matches: number; total: number } | null
  backfillResult: { filterId: number; affectedCount: number } | null
  backfillInProgress: number | null
  getFilterTypeName: (typeValue: number) => string
  getActionTypeName: (typeValue: FilterActionType) => string
  onToggleEnabled: (filter: Filter) => void
  onTest: (filterId: number) => void
  onBackfill: (filterId: number) => void
  onEdit: (filter: Filter) => void
  onDelete: (filterId: number) => void
}

function SortableFilterItem({
  filter,
  testResult,
  backfillResult,
  backfillInProgress,
  getFilterTypeName,
  getActionTypeName,
  onToggleEnabled,
  onTest,
  onBackfill,
  onEdit,
  onDelete,
}: SortableFilterItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: filter.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-4 flex items-start gap-4 hover:bg-muted/50 bg-background"
      data-testid="filter-row"
    >
      <div
        className="pt-1 text-muted-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium truncate">{filter.title}</h4>
          {!filter.enabled && (
            <Badge variant="secondary">Disabled</Badge>
          )}
          {testResult?.filterId === filter.id && (
            <Badge variant="outline">
              {testResult.matches}/{testResult.total} matched
            </Badge>
          )}
          {backfillResult?.filterId === filter.id && (
            <Badge variant="default">
              {backfillResult.affectedCount} articles updated
            </Badge>
          )}
          {backfillInProgress === filter.id && (
            <Badge variant="secondary">Running...</Badge>
          )}
        </div>

        <div className="mt-1 text-sm text-muted-foreground">
          {filter.rules.length > 0 && (
            <span>
              {filter.match_any_rule ? "Match any: " : "Match all: "}
              {filter.rules
                .map(
                  (r) =>
                    `${r.inverse ? "NOT " : ""}${getFilterTypeName(
                      r.filter_type
                    )} ~ "${r.reg_exp}"`
                )
                .join(filter.match_any_rule ? " OR " : " AND ")}
            </span>
          )}
        </div>

        <div className="mt-1 flex flex-wrap gap-1">
          {filter.actions.map((action, idx) => (
            <Badge key={idx} variant="outline" className="text-xs">
              {getActionTypeName(action.action_type)}
              {action.action_param && `: ${action.action_param}`}
            </Badge>
          ))}
        </div>

        {filter.last_triggered && (
          <p className="text-xs text-muted-foreground mt-1">
            Last triggered:{" "}
            {new Date(filter.last_triggered).toLocaleString()}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={filter.enabled}
          onCheckedChange={() => onToggleEnabled(filter)}
          aria-label={`Toggle ${filter.title}`}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onTest(filter.id)}
          aria-label={`Test ${filter.title}`}
        >
          <Play className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onBackfill(filter.id)}
          disabled={backfillInProgress !== null}
          aria-label={`Apply ${filter.title} to existing articles`}
          title="Apply to existing articles"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(filter)}
          aria-label={`Edit ${filter.title}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onDelete(filter.id)}
          aria-label={`Delete ${filter.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
