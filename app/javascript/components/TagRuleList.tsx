import { useEffect, useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import type { TagRule } from "@/lib/api"

interface TagRuleListProps {
  tagId: number
}

/**
 * The searches that apply a tag automatically, in the tag's edit dialog, each
 * with the scope it covers, how many articles it has tagged, and delete.
 */
export function TagRuleList({ tagId }: TagRuleListProps) {
  const [rules, setRules] = useState<TagRule[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setRules(null)
    setError(null)
    api.tagRules
      .list(tagId)
      .then((loaded) => current && setRules(loaded))
      .catch(() => current && setError("Couldn't load auto-tag rules"))
    return () => {
      current = false
    }
  }, [tagId])

  const handleDelete = async (rule: TagRule) => {
    const message =
      `Delete the auto-tag rule "${rule.query}" in ${rule.scope_name}? ` +
      "Articles it tagged lose the tag, unless you tagged them yourself or another rule matches."
    if (!confirm(message)) return

    try {
      await api.tagRules.delete(rule.id)
      setRules((prev) => prev?.filter((r) => r.id !== rule.id) ?? prev)
      setError(null)
    } catch {
      setError("Couldn't delete the rule. Try again.")
    }
  }

  return (
    <section aria-labelledby="tag-rules-heading" className="space-y-2">
      <h4 id="tag-rules-heading" className="text-sm font-medium leading-none">
        Auto-tag rules
      </h4>
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
      {rules === null && !error && (
        <p className="text-sm text-muted-foreground">Loading rules…</p>
      )}
      {rules?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rules yet. To add one, search for articles and choose Save as auto-tag.
        </p>
      )}
      {rules && rules.length > 0 && (
        <ul aria-labelledby="tag-rules-heading" className="divide-y rounded-md border">
          {rules.map((rule) => (
            <li key={rule.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0 text-sm">
                <span className="font-mono break-words">{rule.query}</span>
                <span className="text-muted-foreground"> in {rule.scope_name}</span>
                <div className="text-xs text-muted-foreground">
                  {rule.match_count} {rule.match_count === 1 ? "article" : "articles"}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(rule)}
                aria-label={`Delete rule ${rule.query} in ${rule.scope_name}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
