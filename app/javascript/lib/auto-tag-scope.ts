import type { TagRuleScope } from "@/lib/api"
import type { EntryListScope, SearchPlace } from "@/hooks/useEntrySearch"

export interface AutoTagScope {
  /** What the rule is saved with. */
  scope: TagRuleScope
  /** The feed or category title, or "All feeds". */
  scopeName: string
  /**
   * Set when the search was narrowed by something a rule cannot carry (a tag,
   * the Starred or Published view, the starred-only preference), so the rule
   * covers more than the search showed and the dialog has to say so.
   */
  note: string | null
}

/**
 * The scope a search saved as an auto-tag gets, from the list it ran in and
 * the place pill (Alt+A).
 *
 * A rule can cover all feeds, one feed or one category, the same place axis
 * the pill widens. Read state is not part of a rule, which tags read and new
 * articles alike, so the history pill has no bearing here.
 */
export function autoTagScope(
  list: EntryListScope,
  place: SearchPlace,
  names: { feed?: string | null; category?: string | null } = {}
): AutoTagScope {
  const narrowed = place === "list"

  let scope: TagRuleScope = {}
  let scopeName = "All feeds"
  if (narrowed && list.feed_id) {
    scope = { feed_id: list.feed_id }
    scopeName = names.feed || "This feed"
  } else if (narrowed && list.category_id) {
    scope = { category_id: list.category_id }
    scopeName = names.category || "This category"
  }

  const dropped: string[] = []
  if (narrowed) {
    if (list.tag) dropped.push(`#${list.tag}`)
    if (list.view === "starred") dropped.push("Starred")
    if (list.view === "published") dropped.push("Published")
    if (list.starred === true) dropped.push("starred articles")
  }

  const covers = scope.feed_id || scope.category_id ? `every article in ${scopeName}` : "all feeds"
  const note =
    dropped.length > 0
      ? `Auto-tags can't be limited to ${dropped.join(" or ")}, so this one covers ${covers}.`
      : null

  return { scope, scopeName, note }
}
