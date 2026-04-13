import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Plus, X } from "lucide-react"
import { api, Story } from "@/lib/api"

interface FollowStoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  entryId: number | null
  onStoryCreated?: (story: Story) => void
}

/**
 * Dialog that walks the user through creating a Story from a feed entry.
 *
 * Flow:
 *   1. When opened with an entryId, POST /stories/extract_from_entry to get
 *      proposed { topic, queries } from the LLM.
 *   2. Show the proposed name + editable queries so the user can tweak.
 *   3. On save, POST /stories with the confirmed values.
 *
 * Errors (LLM unreachable, extraction failed) surface inline with a retry
 * option. The user can also skip extraction and enter values manually.
 */
export function FollowStoryDialog({
  open,
  onOpenChange,
  entryId,
  onStoryCreated,
}: FollowStoryDialogProps) {
  const [name, setName] = useState("")
  const [queries, setQueries] = useState<string[]>([""])
  const [sourceEntryId, setSourceEntryId] = useState<number | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracted, setExtracted] = useState(false)

  // Run extraction when the dialog opens with a fresh entry.
  useEffect(() => {
    if (!open || !entryId) return
    if (extracted && sourceEntryId === entryId) return

    setIsExtracting(true)
    setError(null)
    api.stories
      .extractFromEntry(entryId)
      .then((result) => {
        setName(result.topic)
        setQueries(result.queries.length > 0 ? result.queries : [""])
        setSourceEntryId(result.source_entry_id)
        setExtracted(true)
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to extract queries")
        setSourceEntryId(entryId)
      })
      .finally(() => {
        setIsExtracting(false)
      })
  }, [open, entryId, extracted, sourceEntryId])

  // Reset state when dialog closes.
  useEffect(() => {
    if (!open) {
      setName("")
      setQueries([""])
      setSourceEntryId(null)
      setExtracted(false)
      setError(null)
    }
  }, [open])

  const updateQuery = (index: number, value: string) => {
    setQueries((qs) => qs.map((q, i) => (i === index ? value : q)))
  }

  const addQuery = () => setQueries((qs) => [...qs, ""])
  const removeQuery = (index: number) => {
    setQueries((qs) => qs.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    const cleanQueries = queries.map((q) => q.trim()).filter((q) => q.length > 0)
    if (!name.trim() || cleanQueries.length === 0) {
      setError("Please provide a name and at least one query.")
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const story = await api.stories.create({
        story: {
          name: name.trim(),
          queries: cleanQueries,
          source_entry_id: sourceEntryId ?? undefined,
        },
      })
      onStoryCreated?.(story)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create story")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Follow this story</DialogTitle>
          <DialogDescription>
            Nibbler will track related coverage across Google News and summarize updates.
          </DialogDescription>
        </DialogHeader>

        {isExtracting ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Generating queries...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="story-name">Story name</Label>
              <Input
                id="story-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SEC crypto enforcement"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label>Search queries</Label>
              <div className="space-y-2">
                {queries.map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={q}
                      onChange={(e) => updateQuery(i, e.target.value)}
                      placeholder={`Query ${i + 1}`}
                      aria-label={`Search query ${i + 1}`}
                    />
                    {queries.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeQuery(i)}
                        aria-label={`Remove query ${i + 1}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addQuery}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add query
                </Button>
              </div>
            </div>

            {error && <div className="text-sm text-destructive">{error}</div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isExtracting || isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Follow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
