import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { api, Category } from "@/lib/api"

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
  categories: Category[]
  defaultParentId?: number | null
  onCategoryCreated: (category: Category) => void
  onCategoryUpdated: (category: Category) => void
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  categories,
  defaultParentId,
  onCategoryCreated,
  onCategoryUpdated,
}: CategoryDialogProps) {
  const [title, setTitle] = useState("")
  const [parentId, setParentId] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isEditing = !!category

  useEffect(() => {
    if (category) {
      setTitle(category.title)
      setParentId(category.parent_id)
    } else {
      setTitle("")
      setParentId(defaultParentId ?? null)
    }
  }, [category, open, defaultParentId])

  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("Category name is required")
      return
    }

    setIsSaving(true)
    try {
      if (isEditing && category) {
        const updated = await api.categories.update(category.id, {
          category: { title: title.trim(), parent_id: parentId },
        })
        onCategoryUpdated(updated)
      } else {
        const created = await api.categories.create({
          category: { title: title.trim(), parent_id: parentId || undefined },
        })
        onCategoryCreated(created)
      }
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save category:", error)
      alert("Failed to save category")
    } finally {
      setIsSaving(false)
    }
  }

  // Filter out the current category and its children from parent options
  const availableParents = categories.filter((c) => {
    if (!category) return true
    if (c.id === category.id) return false
    // In a proper implementation, we'd also filter out descendants
    return true
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Category" : "Create Category"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-title">Category Name</Label>
            <Input
              id="category-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Tech News, Podcasts"
              autoFocus
            />
          </div>

          {availableParents.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="category-parent">Parent Category (optional)</Label>
              <Select
                value={parentId ? String(parentId) : "none"}
                onValueChange={(value) =>
                  setParentId(value === "none" ? null : parseInt(value))
                }
              >
                <SelectTrigger id="category-parent">
                  <SelectValue placeholder="No parent (top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No parent (top level)</SelectItem>
                  {availableParents.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
