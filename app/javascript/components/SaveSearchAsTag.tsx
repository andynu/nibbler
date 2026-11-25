import { useEffect, useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label as FormLabel } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import type { TagRule } from "@/lib/api"
import type { AutoTagScope } from "@/lib/auto-tag-scope"

export interface SaveSearchAsTagTarget extends AutoTagScope {
  /** The user's tag names, offered as suggestions in the tag field. */
  tagNames: string[]
  /** Called with the saved rule, so the caller can reload its tags. */
  onSaved?: (rule: TagRule) => void
}

interface SaveSearchAsTagProps {
  query: string
  target: SaveSearchAsTagTarget
}

/**
 * The search bar's "Save as auto-tag" action: a button, and the dialog it
 * opens to pick a tag and confirm against the number of articles that match.
 */
export function SaveSearchAsTag({ query, target }: SaveSearchAsTagProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 shrink-0 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus:outline-none focus:ring-1 focus:ring-primary rounded"
      >
        Save as auto-tag…
      </button>
      {open && (
        <SaveSearchAsTagDialog
          query={query.trim()}
          target={target}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

type Preview =
  | { state: "loading" }
  | { state: "ready"; count: number }
  | { state: "error"; message: string }

function SaveSearchAsTagDialog({
  query,
  target,
  onClose,
}: SaveSearchAsTagProps & { onClose: () => void }) {
  const [tagName, setTagName] = useState("")
  const [preview, setPreview] = useState<Preview>({ state: "loading" })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const suggestionsId = useId()

  const { feed_id: feedId, category_id: categoryId } = target.scope

  useEffect(() => {
    let current = true
    api.tagRules
      .preview(query, { feed_id: feedId, category_id: categoryId })
      .then((result) => current && setPreview({ state: "ready", count: result.match_count }))
      .catch(
        (error: unknown) =>
          current &&
          setPreview({
            state: "error",
            message: error instanceof Error ? error.message : "Couldn't count matching articles",
          })
      )
    return () => {
      current = false
    }
  }, [query, feedId, categoryId])

  const trimmedName = tagName.trim()
  const existingName = target.tagNames.find(
    (name) => name.toLowerCase() === trimmedName.toLowerCase()
  )

  const handleSave = async () => {
    if (!trimmedName) return
    setIsSaving(true)
    setSaveError(null)
    try {
      const rule = await api.tagRules.create({
        tag_rule: { query, ...target.scope, tag_name: existingName ?? trimmedName },
      })
      target.onSaved?.(rule)
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Couldn't save the auto-tag")
      setIsSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save search as auto-tag</DialogTitle>
          <DialogDescription>
            Tags articles matching <q className="font-mono text-foreground">{query}</q> in{" "}
            {target.scopeName}, now and as new ones arrive.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          {target.note && <p className="text-sm text-muted-foreground">{target.note}</p>}

          <div className="space-y-2">
            <FormLabel htmlFor="auto-tag-name">Tag</FormLabel>
            <Input
              id="auto-tag-name"
              list={suggestionsId}
              value={tagName}
              onChange={(event) => setTagName(event.target.value)}
              placeholder="Choose a tag or type a new one"
              autoComplete="off"
              aria-describedby="auto-tag-name-help"
              autoFocus
            />
            <datalist id={suggestionsId}>
              {target.tagNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p id="auto-tag-name-help" className="text-xs text-muted-foreground">
              {!trimmedName
                ? "The tag these articles get."
                : existingName
                  ? `Adds this search to ${existingName}.`
                  : `Creates the tag ${trimmedName}.`}
            </p>
          </div>

          <p role="status" className="text-sm">
            {preview.state === "loading" && "Counting matching articles…"}
            {preview.state === "ready" &&
              `${preview.count} ${preview.count === 1 ? "article matches" : "articles match"} now.`}
            {preview.state === "error" && <span className="text-destructive-text">{preview.message}</span>}
          </p>

          {saveError && (
            <p role="alert" className="text-sm text-destructive-text">
              {saveError}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!trimmedName || isSaving || preview.state === "error"}
            >
              {isSaving ? "Saving…" : "Save auto-tag"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
