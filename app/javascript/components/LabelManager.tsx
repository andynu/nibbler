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
import { api, Label } from "@/lib/api"
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
  const [labels, setLabels] = useState<Label[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingLabel, setEditingLabel] = useState<Label | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    loadLabels()
  }, [])

  const loadLabels = async () => {
    try {
      const data = await api.labels.list()
      setLabels(data)
    } catch (error) {
      console.error("Failed to load labels:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (labelId: number) => {
    const label = labels.find((l) => l.id === labelId)
    if (!label) return

    const msg =
      label.entry_count > 0
        ? `Delete "${label.caption}"? It is currently applied to ${label.entry_count} article(s).`
        : `Delete "${label.caption}"?`

    if (!confirm(msg)) return

    try {
      await api.labels.delete(labelId)
      setLabels((prev) => prev.filter((l) => l.id !== labelId))
    } catch (error) {
      console.error("Failed to delete label:", error)
    }
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading labels...</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-medium">Labels</h3>
          <p className="text-sm text-muted-foreground">
            Organize articles with custom labels
          </p>
        </div>
        <Button onClick={() => setIsCreating(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          New Label
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {labels.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p>No labels yet.</p>
            <p className="text-sm mt-1">
              Create labels to organize and classify articles.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {labels.map((label) => (
              <div
                key={label.id}
                className="p-4 flex items-center justify-between hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    style={{
                      backgroundColor: label.bg_color || "#64748b",
                      color: label.fg_color || "#ffffff",
                    }}
                    className="text-sm"
                  >
                    {label.caption}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {label.entry_count} article{label.entry_count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingLabel(label)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(label.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <LabelEditorDialog
        open={isCreating || editingLabel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreating(false)
            setEditingLabel(null)
          }
        }}
        label={editingLabel}
        onSave={async (data) => {
          if (editingLabel) {
            const updated = await api.labels.update(editingLabel.id, { label: data })
            setLabels((prev) =>
              prev.map((l) => (l.id === updated.id ? updated : l))
            )
          } else {
            const created = await api.labels.create({ label: data })
            setLabels((prev) => [...prev, created])
          }
          setIsCreating(false)
          setEditingLabel(null)
        }}
      />
    </div>
  )
}

interface LabelEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  label: Label | null
  onSave: (data: { caption: string; fg_color: string; bg_color: string }) => Promise<void>
}

function LabelEditorDialog({
  open,
  onOpenChange,
  label,
  onSave,
}: LabelEditorDialogProps) {
  const [caption, setCaption] = useState("")
  const [fgColor, setFgColor] = useState("#ffffff")
  const [bgColor, setBgColor] = useState("#3b82f6")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (label) {
      setCaption(label.caption)
      setFgColor(label.fg_color || "#ffffff")
      setBgColor(label.bg_color || "#3b82f6")
    } else {
      setCaption("")
      setFgColor("#ffffff")
      setBgColor("#3b82f6")
    }
  }, [label, open])

  const handleSubmit = async () => {
    if (!caption.trim()) {
      alert("Label name is required")
      return
    }

    setIsSaving(true)
    try {
      await onSave({ caption: caption.trim(), fg_color: fgColor, bg_color: bgColor })
    } catch (error) {
      console.error("Failed to save label:", error)
      alert("Failed to save label")
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
          <DialogTitle>{label ? "Edit Label" : "Create Label"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <FormLabel htmlFor="label-name">Label Name</FormLabel>
            <Input
              id="label-name"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
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
                {caption || "Label"}
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
            {isSaving ? "Saving..." : label ? "Save Changes" : "Create Label"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
