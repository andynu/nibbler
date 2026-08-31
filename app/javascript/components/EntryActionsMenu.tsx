import { EllipsisVertical, StickyNote, FileText, Globe, Bookmark, Link, Rss } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SCORE_VALUES } from "@/components/ScoreButtons"
import type { Entry } from "@/lib/api"

interface EntryActionsMenuProps {
  entry: Entry
  showIframe: boolean
  /** The header's own iframe toggle handler. */
  onToggleIframe: () => void
  /** The header's own note handler; absent when the entry cannot take a note. */
  onEditNote?: () => void
  /**
   * The header's own publish toggle; absent when the parent wires none, in
   * which case the header shows no publish button either.
   */
  onTogglePublished?: () => void
  /** The header's own score handler, the one ScoreButtons calls. */
  onScoreChange?: (score: number) => void
  /** Opens the same FollowStoryDialog the header's bookmark button opens. */
  onFollowStory: () => void
  /**
   * Puts the article's URL on the clipboard, through the same handler the `c`
   * shortcut runs. Absent when the parent wires none.
   */
  onCopyLink?: () => void
}

/**
 * The article actions the header sheds as its pane narrows (ttrb-tyvd).
 *
 * The header drops the note button, the publish toggle, the framing toggle and
 * "Follow this story" below 30rem of pane, and the score control below 40rem.
 * A phone in portrait is under both, and until this existed there was no second
 * way to reach any of them: MobileNavBar switches panes and carries no article
 * actions, and nothing on screen hinted they existed.
 *
 * The publish toggle joined that list once the row was measured (ttrb-h12t):
 * at 320px the header wanted 344px and clipped its own overflow trigger, and
 * this was the action of the five left that a phone reader needs least.
 *
 * Every item here calls the handler the header's own button calls rather than a
 * copy of it, so a change to what "follow this story" means reaches both. The
 * score rows are the one place the presentation is not shared - ScoreButtons
 * draws five 24px squares, which is not a thumb target - but they map over
 * SCORE_VALUES from that same component and call the same onScoreChange, so the
 * scale cannot drift either.
 *
 * Visibility is left to the same widths that hide the buttons, so the trigger
 * appears exactly when something is missing: 40rem when there is a score
 * control to lose, 30rem when there is not. Between the two, four of these are
 * in the header as well; a menu that is a superset of the toolbar is the
 * ordinary shape for an overflow menu, and the alternative (per-item
 * breakpoint classes) would leave display:none rows inside a Radix menu, where
 * they stay in the roving-focus collection and arrow keys land on nothing.
 *
 * Those widths are the ARTICLE PANE's, read off the `article-pane` container
 * EntryContent opens on its root, not the window's (ttrb-1zn8). On the
 * viewport breakpoints this trigger used to carry, a 1024px window put the
 * pane at 464px: the header drew all 450px of its action row into it, clipped
 * the last 90, and hid this menu at the same time - so the score control, the
 * framing toggle, "Follow this story" and "Open in new tab" were off screen
 * with nothing left pointing at them. Keying trigger and buttons to one
 * container is what makes that combination impossible rather than merely
 * fixed: whatever the header sheds, it sheds at a width where this is drawn.
 */
export function EntryActionsMenu({
  entry,
  showIframe,
  onToggleIframe,
  onEditNote,
  onTogglePublished,
  onScoreChange,
  onFollowStory,
  onCopyLink,
}: EntryActionsMenuProps) {
  // Container queries, not media queries: these read EntryContent's
  // `article-pane` container. A component rendered outside that container
  // matches neither, which fails safe - the trigger stays visible.
  const hiddenAt = onScoreChange
    ? "@min-[40rem]/article-pane:hidden"
    : "@min-[30rem]/article-pane:hidden"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* lucide-react marks its svg aria-hidden when the icon has no children
            and no a11y prop, so an icon-only trigger without this label computes
            an empty accessible name and is unreachable by both screen readers
            and getByRole. */}
        <Button
          variant="ghost"
          size="icon"
          className={hiddenAt}
          aria-label="More article actions"
        >
          <EllipsisVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* In the order the header lays them out, so a reader who has seen the
            toolbar on a wider screen finds them where they expect. */}
        {onTogglePublished && (
          <DropdownMenuItem onClick={onTogglePublished}>
            <Rss className="h-4 w-4 mr-2" />
            {entry.is_published ? "Remove from public feed" : "Add to public feed"}
          </DropdownMenuItem>
        )}
        {onEditNote && (
          <DropdownMenuItem onClick={onEditNote}>
            <StickyNote className="h-4 w-4 mr-2" />
            {entry.note ? "Edit note" : "Add note"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onToggleIframe}>
          {showIframe ? (
            <FileText className="h-4 w-4 mr-2" />
          ) : (
            <Globe className="h-4 w-4 mr-2" />
          )}
          {showIframe ? "Show RSS content" : "Show original page"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFollowStory}>
          <Bookmark className="h-4 w-4 mr-2" />
          Follow this story
        </DropdownMenuItem>
        {/* The one row here that is not a shed header button. It is in this
            menu for the same reason the others are: the keyboard is the only
            other way to it, and a phone has no keyboard. The header keeps
            "Open in new tab" at every width and this sits beside it in the
            menu rather than in the toolbar, where a fifth icon would cost
            every width to serve the widths that have no `c`. */}
        {onCopyLink && (
          <DropdownMenuItem onClick={onCopyLink}>
            <Link className="h-4 w-4 mr-2" />
            Copy link
          </DropdownMenuItem>
        )}
        {onScoreChange && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Score</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={String(entry.score)}
              onValueChange={(value) => onScoreChange(Number(value))}
            >
              <DropdownMenuRadioItem value="0">No score</DropdownMenuRadioItem>
              {SCORE_VALUES.map((n) => (
                <DropdownMenuRadioItem key={n} value={String(n)}>
                  Score {n}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
