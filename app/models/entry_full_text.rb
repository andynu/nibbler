# The article as its publisher printed it, fetched because the feed only sent an
# excerpt, cached against the shared Entry.
#
# Hangs off Entry rather than UserEntry for the reason EntrySummary does: the
# text of an article does not vary by who is reading it, so one reader asking
# for it serves every other subscriber to that feed and costs the publisher one
# request instead of one per subscriber.
#
# == A failed fetch is a row, not the absence of one
#
# +status+ is "ok" or "failed", and a failed row is the point. Without it, every
# open of an article whose publisher refuses us would go back and ask again,
# which is both rude to that publisher and slow for the reader. The row says "we
# asked, it did not work, do not ask again yet"; RETRY_AFTER says how long yet
# is. This is a memory of an answer, not a backoff ladder -- the spacing between
# requests is DomainThrottler's job and is not reimplemented here.
#
# The row records +failure_detail+ for the log and for anyone reading the table,
# but the reader is told one generic thing whatever it says. See
# FullArticleFetcher for why the cause is deliberately not attributed.
#
# == It never touches Entry#content
#
# Entry#content is what the feed published and Entry#content_hash is a digest of
# it. Both are load-bearing: the ingest path compares that hash to decide whether
# an entry changed, and EntrySummary and CachedAudio invalidate against it.
# Writing a fetched page into either would make every subsequent refresh look
# like an edit and would drop the summary and audio caches on an article nobody
# edited. This table is the separate place that keeps all of that intact.
#
# @see FullArticleFetcher for the fetch, its limits and its politeness rules
# @see Entry#readable_content for the accessor that prefers this over the excerpt
class EntryFullText < ApplicationRecord
  belongs_to :entry

  OK = "ok".freeze
  FAILED = "failed".freeze
  STATUSES = [ OK, FAILED ].freeze

  # How long a failed fetch is believed before it is worth asking again.
  #
  # Long enough that walking a feed of excerpt-only articles does not re-ask a
  # refusing host once per article, short enough that a site that was down at
  # breakfast can be read at lunch. It is not a backoff: a second failure resets
  # fetched_at and buys another RETRY_AFTER, which is the same interval rather
  # than a growing one, because the causes here (a wall, a bot filter) do not
  # clear on a schedule that doubling would track.
  RETRY_AFTER = 6.hours

  # The single thing a reader is told when a fetch did not work, whatever went
  # wrong. A paywall, a bot filter, a timeout and a page with no prose in it all
  # produce this sentence: from this side they are barely distinguishable, most
  # walls answer 200 with a truncated body, and a timeout reported as a paywall
  # is worse than saying nothing about the cause. The article's own link is
  # offered alongside it, which is the thing the reader can actually act on.
  UNAVAILABLE_MESSAGE = "The full article could not be retrieved.".freeze

  # Floor on the extracted text below which the fetch is recorded as a failure.
  #
  # A page that yields less than this yielded navigation and a cookie notice,
  # not an article. Deliberately unrelated to EntrySummarizer::MIN_CONTENT_CHARS,
  # which answers a different question (is there enough here to be worth
  # compressing) and belongs to a feature that may or may not be the caller.
  MIN_TEXT_CHARS = 200

  validates :status, inclusion: { in: STATUSES }
  validates :content_hash, presence: true
  validates :fetched_at, presence: true

  def ok?
    status == OK
  end

  def failed?
    status == FAILED
  end

  # True when the feed has republished the article since this was fetched.
  #
  # Same comparison EntrySummary#stale? makes, against the same column: the
  # entry already carries a hash of its body, so there is no reason to compute a
  # second one here.
  def stale?
    content_hash != entry.content_hash
  end

  # True when there is fetched text here worth reading in place of the excerpt.
  def usable?
    ok? && content.present? && !stale?
  end

  # True when asking the publisher again is reasonable right now.
  #
  # A current success is never refetched. A success whose entry has changed
  # underneath it is, because the page behind a republished article has usually
  # changed too. A failure is, once RETRY_AFTER has passed.
  def refetchable?(now: Time.current)
    return true if stale?
    return fetched_at <= now - RETRY_AFTER if failed?

    false
  end

  # The entry's full text, fetching it if there is no current answer.
  #
  # This is the whole on-demand path: nothing fetches at feed refresh. Refreshing
  # eagerly would mean one outbound request per new item across every subscribed
  # feed, almost all of them for articles nobody opens, which is a great deal of
  # someone else's bandwidth spent on nothing.
  #
  # @param entry [Entry]
  # @return [EntryFullText] always a persisted row, "ok" or "failed"
  def self.for(entry)
    existing = entry.entry_full_text
    return existing if existing && !existing.refetchable?

    fetch(entry, existing)
  end

  # @api private
  def self.fetch(entry, existing)
    result = FullArticleFetcher.new(entry.link).call
    record = existing || entry.build_entry_full_text

    text = result.ok? ? ArticleText.from_html(result.html) : ""
    if result.ok? && improvement?(entry, text)
      record.assign_attributes(status: OK, content: result.html, char_count: text.length, failure_detail: nil)
    else
      record.assign_attributes(status: FAILED, content: "", char_count: 0, failure_detail: failure_detail(result, text))
    end

    record.update!(content_hash: entry.content_hash, fetched_at: Time.current)
    record
  rescue ActiveRecord::RecordNotUnique
    # Two readers opened the same article at once and both missed the cache. The
    # unique index on entry_id is what decides which insert survives; the loser
    # reads the winner's row rather than raising at a reader who did nothing
    # wrong. Both fetches already happened, so nothing is saved by locking first.
    entry.reload.entry_full_text
  end
  private_class_method :fetch

  # Whether what came back is worth storing over what the feed already gave us.
  #
  # Not a paywall detector, and deliberately not one: this asks only whether the
  # fetch produced more article than we had, which is the entire point of doing
  # it. A truncated page and a page that never held prose fail this the same way
  # and are reported the same way.
  def self.improvement?(entry, text)
    text.length >= MIN_TEXT_CHARS && text.length > ArticleText.from_html(entry.content).length
  end
  private_class_method :improvement?

  def self.failure_detail(result, text)
    return result.detail unless result.ok?

    "extracted #{text.length} characters, no more than the feed's own body"
  end
  private_class_method :failure_detail
end
