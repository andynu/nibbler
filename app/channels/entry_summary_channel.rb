# Carries one article's summary generation to everyone reading that article.
#
# The stream is keyed on the *entry*, not the user, because that is what the
# data is. An EntrySummary hangs off the shared Entry (see EntrySummary), so a
# summary one reader asks for is the summary every other subscriber to that feed
# would have got. Keying the stream per user would mean generating it once and
# then telling only one of them, which throws away the reason the row is on Entry
# in the first place. Two people reading the same article at the same time both
# watch the same generation finish.
#
# That makes the subscription itself the access check. An entry id is a small
# integer and a client picks it, so without a check this channel would be a way
# to watch the summary of any article in the database -- including one from a
# feed the subscriber has never subscribed to. #subscribed therefore requires a
# UserEntry joining this user to this entry, which is the same thing
# Api::V1::EntriesController's `current_user.user_entries.find(params[:id])`
# requires of every other entry endpoint.
#
# Rejection is silent to other subscribers: Action Cable refuses this one
# subscription and does not retry it, so a client that asks for the wrong entry
# simply never receives anything.
#
# @see SummarizeEntryJob for the process that broadcasts here
# @see EntrySummary for why the summary is shared rather than per-reader
class EntrySummaryChannel < ApplicationCable::Channel
  # Every state a client can be sent, in the order a successful run visits them.
  #
  # "queued" and "running" are separate because generation on a local model
  # takes tens of seconds and the two waits mean different things to a reader:
  # queued is "the server has the request, other work is ahead of it", running
  # is "the model is writing". A single spinner covering both says less than the
  # server already knows.
  #
  # "too_short" is terminal and is not a failure. EntrySummarizer::TooShort and
  # EntrySummarizer::SummaryFailed are deliberately unrelated exception classes
  # -- one means the article can never be summarized usefully, the other means
  # the model misbehaved and pressing the button again is reasonable -- so
  # collapsing them into one wire state here would undo that distinction at the
  # only point where a reader sees it.
  STATES = %w[queued running ready failed unavailable too_short].freeze

  # The stream both sides name. Broadcasters have an entry id, subscribers send
  # one over the wire as JSON, and JSON does not distinguish 12 from "12", so
  # the id is coerced here rather than in two places that could drift.
  #
  # @param entry_id [Integer, String]
  # @return [String]
  # @raise [ArgumentError, TypeError] if the id is not an integer
  def self.stream_name_for(entry_id)
    "entry_summary:#{Integer(entry_id)}"
  end

  # The one shape a summary takes on the wire.
  #
  # Both the broadcast and the REST replies (Api::V1::EntriesController#summarize
  # and #show) send this, so the client has a single type for a summary however
  # it arrived. It lives on the channel because the channel is where this
  # feature's wire vocabulary is defined; EntrySummary itself stays a model.
  #
  # `stale` is included because the client cannot work it out: it never sees
  # either content_hash. A stale summary is still shown, marked as describing an
  # earlier version of the article, with a control to regenerate it.
  #
  # @param entry_summary [EntrySummary, nil]
  # @return [Hash, nil]
  def self.summary_payload(entry_summary)
    return nil if entry_summary.nil?

    {
      summary: entry_summary.summary,
      model: entry_summary.model,
      generated_at: entry_summary.generated_at,
      stale: entry_summary.stale?
    }
  end

  def subscribed
    entry_id = requested_entry_id
    return reject if entry_id.nil?
    return reject unless subscriber_reads_entry?(entry_id)

    stream_from self.class.stream_name_for(entry_id)
  end

  private
    def requested_entry_id
      Integer(params[:entry_id])
    rescue ArgumentError, TypeError
      nil
    end

    def subscriber_reads_entry?(entry_id)
      current_user.user_entries.exists?(entry_id: entry_id)
    end
end
