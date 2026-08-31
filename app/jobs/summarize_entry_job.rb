# Generates one article's summary and pushes every state change to the readers
# watching that article.
#
# Triggered only by a reader asking for it (Api::V1::EntriesController#summarize).
# Nothing enqueues this on a schedule and nothing enqueues it from a render: a
# stale summary is shown as stale with a regenerate control, so rendering an
# article never spends model throughput on its own.
#
# == Duplicate suppression
#
# Summaries hang off the shared Entry, so N readers clicking the same article
# must produce ONE call to the model. Three things in series get that, and it
# takes all three -- see test/jobs/summarize_entry_job_concurrency_test.rb,
# which drives them from several connections at once and carries the control
# run that gives the numbers meaning.
#
# 1. GoodJob's concurrency control keyed on the entry, +total_limit: 1+. While a
#    job for this entry is unfinished -- queued or running -- a further enqueue
#    is aborted and +perform_later+ returns false. This is a filter, not a mutex:
#    GoodJob takes pg_advisory_xact_lock around its count but rolls that
#    transaction back before ActiveJob hands the job to the adapter, so the lock
#    is released before the row is written. Six simultaneous presses collapse to
#    two rows, not one.
# 2. GoodJob's perform-side check, from the same +total_limit: 1+. This one is
#    strict: a job counts as running only once a worker holds an advisory lock on
#    its row for the duration, so of two jobs with the same key the older runs
#    and the younger raises ConcurrencyExceededError and retries later. Two
#    generations for one entry cannot overlap.
# 3. #perform re-reads the entry and returns the cached summary without calling
#    the model if a current one appeared while it waited. Given (2) serialises
#    them, the straggler from (1) finds the first job's summary and spends
#    nothing.
#
# Chosen over the two alternatives:
#
# - Api::V1::EntriesController#audio's approach, a LIKE against the JSON
#   +serialized_params+ column looking for the entry id. It works, but it is an
#   unindexable substring match on JSON that also matches a job whose *other*
#   argument happens to contain those digits, and there is no reason to spread
#   it. GoodJob writes the key to a real +concurrency_key+ column with a partial
#   index on unfinished rows, which is the same question asked properly.
# - A state column on entry_summaries. It would need the migration relaxing
#   three NOT NULLs so a row could exist before there is a summary in it, and it
#   would still be a hand-rolled check-then-insert: measured, that pattern lost
#   the race in 30 trials out of 30.
#
# == States on the wire
#
# queued (enqueued, including after a retry), running (the model is being
# called), then one of ready, failed, unavailable or too_short. See
# EntrySummaryChannel::STATES for what each means and why too_short is not
# spelled failed.
#
# LlmClient::Unreachable is retried three times with polynomial backoff and only
# reported as "unavailable" once those are exhausted, so a restarting Ollama does
# not flash an error at a reader who would have got their summary a few seconds
# later. Note the block form of +retry_on+ rather than a separate +discard_on+
# for the same class: ActiveSupport::Rescuable searches handlers in reverse
# declaration order, so a +discard_on+ written after a +retry_on+ for the same
# exception wins and the retries never happen.
#
# @see EntrySummarizer for the prompt and the model call
# @see EntrySummaryChannel for the stream and the payload shape
# @see EntrySummary for why one generation serves every subscriber
class SummarizeEntryJob < ApplicationJob
  include GoodJob::ActiveJobExtensions::Concurrency

  queue_as :default

  # What a reader is told when generation broke in a way that is worth pressing
  # the button again for. Deliberately not the exception's own message:
  # EntrySummarizer::SummaryFailed carries the model's raw output for the log,
  # and that is not something to render.
  GENERIC_FAILURE = "The summary could not be generated.".freeze

  # What a reader is told when Ollama did not answer at all, after retries.
  UNAVAILABLE_MESSAGE = "The summarizer is not responding right now.".freeze

  # What a reader is told about an article with too little text to summarize.
  # The usual cause is a feed that publishes an excerpt rather than the article.
  TOO_SHORT_MESSAGE = "This article is too short to summarize.".freeze

  # Outcomes with a state of their own, listed so the catch-all below can let
  # them past to the handlers that know how to report them.
  KNOWN_OUTCOMES = [
    EntrySummarizer::TooShort,
    EntrySummarizer::SummaryFailed,
    LlmClient::Unreachable
  ].freeze

  good_job_control_concurrency_with(
    total_limit: 1,
    key: -> { self.class.concurrency_key_for(arguments.first) }
  )

  retry_on LlmClient::Unreachable, wait: :polynomially_longer, attempts: 3 do |job, error|
    Rails.logger.warn(
      "SummarizeEntryJob: entry #{job.arguments.first} gave up after #{job.executions} attempts — " \
      "Ollama unreachable (#{error.message})"
    )
    job.broadcast_state("unavailable", message: UNAVAILABLE_MESSAGE)
  end

  discard_on EntrySummarizer::TooShort do |job, error|
    Rails.logger.info(
      "SummarizeEntryJob: entry #{job.arguments.first} not summarizable — #{error.message}"
    )
    job.broadcast_state("too_short", message: TOO_SHORT_MESSAGE, content_length: error.content_length)
  end

  discard_on EntrySummarizer::SummaryFailed do |job, error|
    Rails.logger.warn(
      "SummarizeEntryJob: entry #{job.arguments.first} produced no usable summary — #{error.message}"
    )
    job.broadcast_state("failed", message: GENERIC_FAILURE)
  end

  after_enqueue do |job|
    job.broadcast_state("queued")
  end

  # The lock GoodJob counts against, and the name of the single generation for
  # an entry. One definition so the job and anything asking about it agree.
  #
  # @param entry_id [Integer, String]
  # @return [String]
  def self.concurrency_key_for(entry_id)
    "summarize_entry:#{entry_id}"
  end

  # Tests can override this to inject a stub summarizer without going through
  # ActiveJob serialization. Same seam as AnalyzeStoryJob.analyzer_factory.
  class << self
    attr_writer :summarizer_factory

    def summarizer_factory
      @summarizer_factory ||= -> { EntrySummarizer.new }
    end

    # @param entry_id [Integer, String]
    # @param state [String] one of EntrySummaryChannel::STATES
    def broadcast_state(entry_id, state, **payload)
      ActionCable.server.broadcast(
        EntrySummaryChannel.stream_name_for(entry_id),
        { entry_id: Integer(entry_id), state: state }.merge(payload)
      )
    end
  end

  # Public because +retry_on+ and +discard_on+ take class-level blocks that are
  # handed the job as an argument rather than run in its context.
  #
  # @param state [String] one of EntrySummaryChannel::STATES
  def broadcast_state(state, **payload)
    self.class.broadcast_state(arguments.first, state, **payload)
  end

  def perform(entry_id)
    entry = Entry.find_by(id: entry_id)
    return unless entry

    cached = entry.entry_summary
    return broadcast_ready(cached) if cached && !cached.stale?

    broadcast_state("running")
    result = self.class.summarizer_factory.call.summarize(entry)
    broadcast_ready(persist(entry, cached, result))
  rescue *KNOWN_OUTCOMES
    # Reported by the handlers above, which know which state each one is and
    # whether to retry first. Nothing to say here.
    raise
  rescue StandardError => e
    # Anything else -- a database error, a bug in this file -- would otherwise
    # leave the reader watching a spinner that never resolves, because the whole
    # point of the channel is that the page has stopped asking. Say something,
    # then let the job fail as it would have.
    Rails.logger.error(
      "SummarizeEntryJob: entry #{entry_id} failed unexpectedly — #{e.class}: #{e.message}"
    )
    broadcast_state("failed", message: GENERIC_FAILURE)
    raise
  end

  private
    def broadcast_ready(entry_summary)
      broadcast_state("ready", summary: EntrySummaryChannel.summary_payload(entry_summary))
    end

    def persist(entry, cached, result)
      record = cached || entry.build_entry_summary
      record.update!(
        summary: result[:summary],
        model: result[:model],
        content_hash: entry.content_hash,
        generated_at: Time.current
      )
      record
    end
end
