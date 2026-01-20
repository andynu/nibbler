import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label as FormLabel } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { api, Tag } from "@/lib/api"
import { Plus, Pencil, Trash2 } from "lucide-react"

const DEFAULT_COLORS = [
  { fg: "#ffffff", bg: "#ef4444" }, // Red
  { fg: "#ffffff", bg: "#f97316" }, // Orange
  { fg: "#000000", bg: "#eab308" }, // Yellow
  { fg: "#ffffff", bg: "#22c55e" }, // Green
  { fg: "#ffffff", bg: "#3b82f6" }, // Blue
  { fg: "#ffffff", bg: "#8b5cf6" }, // Purple
  { fg: "#ffffff", bg: "#ec4899" }, // Pink
  { fg: "#ffffff", bg: "#64748b" }, // Slate
]

export function LabelManager() {
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadTags()
  }, [])

  const loadTags = async () => {
    try {
      const data = await api.tags.list()
      setTags(data)
    } catch (error) {
      console.error("Failed to load tags:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (tagId: number) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return

    const msg =
      tag.entry_count > 0
        ? `Delete "${tag.name}"? It is currently applied to ${tag.entry_count} article(s).`
        : `Delete "${tag.name}"?`

    if (!confirm(msg)) return

    try {
      await api.tags.delete(tagId)
      setTags((prev) => prev.filter((t) => t.id !== tagId))
    } catch (error) {
      console.error("Failed to delete tag:", error)
    }
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading tags...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-medium">Tags</h3>
          <p className="text-sm text-muted-foreground">
            Organize articles with custom tags
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Tag
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {tags.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No tags yet.</p>
            <p className="text-sm mt-1">
              Create tags to organize and classify articles.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="p-4 flex items-center justify-between hover:bg-muted/50"
                data-testid="tag-row"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    style={{
                      backgroundColor: tag.bg_color || "#64748b",
                      color: tag.fg_color || "#ffffff",
                    }}
                    className="text-sm"
                  >
                    {tag.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {tag.entry_count} article{tag.entry_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingTag(tag)}
                    aria-label={`Edit ${tag.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tag.id)}
                    aria-label={`Delete ${tag.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <TagEditorDialog
        open={isCreating || editingTag !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false)
            setEditingTag(null)
          }
        }}
        tag={editingTag}
        onSave={async (data) => {
          if (editingTag) {
            const updated = await api.tags.update(editingTag.id, { tag: data })
            setTags((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t))
            )
          } else {
            const created = await api.tags.create({ tag: data })
            setTags((prev) => [...prev, created])
          }
          setIsCreating(false)
          setEditingTag(null)
        }}
      />
    </div>
  )
}

interface TagEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag: Tag | null
  onSave: (data: { name: string; fg_color: string; bg_color: string }) => Promise<void>
}

function TagEditorDialog({
  open,
  onOpenChange,
  tag,
  onSave,
}: TagEditorDialogProps) {
  const [name, setName] = useState("")
  const [fgColor, setFgColor] = useState("#ffffff")
  const [bgColor, setBgColor] = useState("#3b82f6")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (tag) {
      setName(tag.name)
      setFgColor(tag.fg_color || "#ffffff")
      setBgColor(tag.bg_color || "#3b82f6")
    } else {
      setName("")
      setFgColor("#ffffff")
      setBgColor("#3b82f6")
    }
  }, [tag, open])

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("Tag name is required")
      return
    }

    setIsSaving(true)
    try {
      await onSave({ name: name.trim(), fg_color: fgColor, bg_color: bgColor })
    } catch (error) {
      console.error("Failed to save tag:", error)
      alert("Failed to save tag")
    } finally {
      setIsSaving(false)
    }
  }

  const handlePresetClick = (preset: { fg: string; bg: string }) => {
    setFgColor(preset.fg)
    setBgColor(preset.bg)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tag ? "Edit Tag" : "Create Tag"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="tag-name">Tag Name</FormLabel>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Important, Read Later"
            />
          </div>

          <div className="space-y-2">
            <FormLabel>Preview</FormLabel>
            <div className="p-4 border rounded-md bg-muted/30 flex items-center justify-center">
              <Badge
                style={{
                  backgroundColor: bgColor,
                  color: fgColor,
                }}
                className="text-sm px-3 py-1"
              >
                {name || "Tag"}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <FormLabel>Color Presets</FormLabel>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_COLORS.map((preset, idx) => (
                <button
                  key={idx}
                  className="w-8 h-8 rounded-md border-2 transition-all hover:scale-110"
                  style={{
                    backgroundColor: preset.bg,
                    borderColor:
                      bgColor === preset.bg ? "currentColor" : "transparent",
                  }}
                  onClick={() => handlePresetClick(preset)}
                  type="button"
                  data-testid="color-preset"
                  aria-label={`Color preset ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <FormLabel htmlFor="bg-color">Background</FormLabel>
              <div className="flex gap-2">
                <Input
                  id="bg-color"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <FormLabel htmlFor="fg-color">Text</FormLabel>
              <div className="flex gap-2">
                <Input
                  id="fg-color"
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-12 h-10 p-1 cursor-pointer"
                />
                <Input
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? "Saving..." : tag ? "Save Changes" : "Create Tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
