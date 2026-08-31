require "test_helper"

class SummarizeEntryJobTest < ActiveJob::TestCase
  include ActionCable::TestHelper

  PARAGRAPH = "Three brokerages will pay ninety million dollars to settle claims that " \
              "they misreported client holdings, the largest such settlement the " \
              "commission has reached.".freeze

  setup do
    @entry = entries(:basic)
    @original_factory = SummarizeEntryJob.summarizer_factory
  end

  teardown do
    SummarizeEntryJob.summarizer_factory = @original_factory
  end

  # --- the happy path -------------------------------------------------------

  test "persists the paragraph, the model that wrote it, and when" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    freeze_time do
      assert_difference -> { EntrySummary.count }, 1 do
        SummarizeEntryJob.perform_now(@entry.id)
      end

      summary = @entry.reload.entry_summary
      assert_equal PARAGRAPH, summary.summary
      assert_equal "gemma4:e4b", summary.model
      assert_equal Time.current, summary.generated_at
    end
  end

  # Stamped from the entry rather than recomputed, so the stored hash is
  # comparable with the one the ingest path maintains.
  test "stamps the summary with the entry's current content hash" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    SummarizeEntryJob.perform_now(@entry.id)

    summary = @entry.reload.entry_summary
    assert_equal @entry.content_hash, summary.content_hash
    assert_not summary.stale?
  end

  test "broadcasts the finished paragraph on the entry's stream" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    SummarizeEntryJob.perform_now(@entry.id)

    message = last_message
    assert_equal "ready", message["state"]
    assert_equal @entry.id, message["entry_id"]
    assert_equal PARAGRAPH, message.dig("summary", "summary")
    assert_equal "gemma4:e4b", message.dig("summary", "model")
    assert_equal false, message.dig("summary", "stale")
  end

  # A local model takes tens of seconds. "Queued" and "running" are different
  # waits and the server knows which one it is in, so it says.
  test "says it is running before it calls the model, not only afterwards" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    SummarizeEntryJob.perform_now(@entry.id)

    assert_equal [ "running", "ready" ], states
  end

  test "says it is queued as soon as it is enqueued" do
    SummarizeEntryJob.perform_later(@entry.id)

    assert_equal [ "queued" ], states
    assert_equal @entry.id, last_message["entry_id"]
  end

  # --- the cache ------------------------------------------------------------

  test "sends the cached paragraph back without calling the model" do
    existing = create_summary(content_hash: @entry.content_hash, summary: "Already written.")
    summarizer = stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    assert_no_difference -> { EntrySummary.count } do
      SummarizeEntryJob.perform_now(@entry.id)
    end

    assert_equal 0, summarizer.calls, "a current summary must not cost model throughput"
    assert_equal [ "ready" ], states
    assert_equal existing.summary, last_message.dig("summary", "summary")
  end

  # The reader asked for this: a stale summary is shown as stale with a
  # regenerate control, and pressing it has to actually regenerate.
  test "regenerates over a summary written against superseded text" do
    create_summary(content_hash: "a-hash-the-entry-no-longer-has", summary: "About the old text.")
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })

    assert_no_difference -> { EntrySummary.count } do
      SummarizeEntryJob.perform_now(@entry.id)
    end

    summary = @entry.reload.entry_summary
    assert_equal PARAGRAPH, summary.summary
    assert_equal @entry.content_hash, summary.content_hash
    assert_equal [ "running", "ready" ], states
  end

  # --- outcomes that are not a summary --------------------------------------

  # TooShort is a refusal, not a failure: nothing was sent to the model and
  # nothing will succeed on retry. Reporting it as "failed" would put a retry
  # button in front of a reader for whom retrying can never work.
  test "reports an article with too little text as too_short, with its length" do
    stub_summarizer(raise: EntrySummarizer::TooShort.new(340))

    assert_no_difference -> { EntrySummary.count } do
      SummarizeEntryJob.perform_now(@entry.id)
    end

    assert_equal [ "running", "too_short" ], states
    assert_equal 340, last_message["content_length"]
    assert_equal SummarizeEntryJob::TOO_SHORT_MESSAGE, last_message["message"]
  end

  test "does not retry an article that is too short" do
    summarizer = stub_summarizer(raise: EntrySummarizer::TooShort.new(340))

    perform_enqueued_jobs { SummarizeEntryJob.perform_later(@entry.id) }

    assert_equal 1, summarizer.calls, "nothing was sent to the model; a retry cannot help"
  end

  test "reports a garbled model response as failed" do
    stub_summarizer(raise: EntrySummarizer::SummaryFailed.new("unusable summary: \"ok\""))

    assert_no_difference -> { EntrySummary.count } do
      SummarizeEntryJob.perform_now(@entry.id)
    end

    assert_equal [ "running", "failed" ], states
    assert_equal SummarizeEntryJob::GENERIC_FAILURE, last_message["message"]
  end

  # SummaryFailed carries the model's raw output so the log can show it. That is
  # for the log, not for a callout on the page.
  test "does not put the model's raw output on the wire" do
    stub_summarizer(raise: EntrySummarizer::SummaryFailed.new("entry 1: \"<|im_start|>garbage\""))

    SummarizeEntryJob.perform_now(@entry.id)

    assert_not_includes last_message.to_s, "im_start"
  end

  # --- Ollama being down ----------------------------------------------------

  # Counted rather than ordered because the test adapter inverts one edge of the
  # sequence: `perform_enqueued_jobs` runs the job from inside ActiveJob's
  # enqueue callback chain, so the after_enqueue "queued" broadcast lands after
  # the work it announced. Under GoodJob's :external mode, which both
  # development and production run, enqueue returns before any worker sees the
  # row and the order on the wire is the one a reader expects.
  test "retries three times before saying the summarizer is unavailable" do
    summarizer = stub_summarizer(raise: LlmClient::Unreachable.new("connection refused"))

    perform_enqueued_jobs { SummarizeEntryJob.perform_later(@entry.id) }

    assert_equal 3, summarizer.calls
    assert_equal 3, states.count("running")
    assert_equal 3, states.count("queued"), "the first enqueue and one per retry"
    assert_equal 1, states.count("unavailable")
    assert_operator states.index("unavailable"), :>, states.rindex("running"),
      "the reader is told it is unavailable only after the last attempt"
    assert_equal SummarizeEntryJob::UNAVAILABLE_MESSAGE, messages.find { |m| m["state"] == "unavailable" }["message"]
  end

  # A restarting Ollama must not flash an error at a reader who would have had
  # their summary a few seconds later.
  test "says nothing about being unavailable while retries remain" do
    stub_summarizer(raise: LlmClient::Unreachable.new("connection refused"))

    SummarizeEntryJob.perform_now(@entry.id)

    assert_not_includes states, "unavailable"
    assert_equal [ "running", "queued" ], states, "the first failure re-queues rather than reporting"
  end

  # --- everything else ------------------------------------------------------

  # Without this the page would sit on a spinner for ever: the whole point of
  # the channel is that the client has stopped asking.
  test "reports an unexpected error rather than leaving the reader waiting" do
    stub_summarizer(raise: RuntimeError.new("the database went away"))

    assert_raises(RuntimeError) { SummarizeEntryJob.perform_now(@entry.id) }

    assert_equal [ "running", "failed" ], states
    assert_equal SummarizeEntryJob::GENERIC_FAILURE, last_message["message"]
  end

  test "does nothing for an entry that has been purged" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })
    missing_id = Entry.maximum(:id).to_i + 1

    assert_no_broadcasts(EntrySummaryChannel.stream_name_for(missing_id)) do
      assert_nothing_raised { SummarizeEntryJob.perform_now(missing_id) }
    end
  end

  test "broadcasts to the entry's stream and no one else's" do
    stub_summarizer(result: { summary: PARAGRAPH, model: "gemma4:e4b" })
    other = user_entries(:read_entry).entry

    assert_no_broadcasts(EntrySummaryChannel.stream_name_for(other.id)) do
      SummarizeEntryJob.perform_now(@entry.id)
    end
  end

  # --- the concurrency contract ---------------------------------------------

  # The key is what makes two clicks one generation, and what
  # Api::V1::EntriesController relies on when it treats a refused enqueue as
  # "already queued". It is per entry, not per user or per job class.
  test "the concurrency key names the entry" do
    assert_equal "summarize_entry:#{@entry.id}", SummarizeEntryJob.concurrency_key_for(@entry.id)
    assert_not_equal(
      SummarizeEntryJob.concurrency_key_for(@entry.id),
      SummarizeEntryJob.concurrency_key_for(@entry.id + 1)
    )
  end

  test "the job resolves its own concurrency key from its argument" do
    job = SummarizeEntryJob.new(@entry.id)

    assert_equal SummarizeEntryJob.concurrency_key_for(@entry.id), job.good_job_concurrency_key
  end

  test "one generation at a time per entry, queued or running" do
    assert_equal 1, SummarizeEntryJob.good_job_concurrency_config[:total_limit]
  end

  private
    def stub_summarizer(result: nil, raise: nil)
      summarizer = StubSummarizer.new(result: result, raise: raise)
      SummarizeEntryJob.summarizer_factory = -> { summarizer }
      summarizer
    end

    def create_summary(content_hash:, summary:)
      EntrySummary.create!(
        entry: @entry,
        summary: summary,
        model: "gemma4:e4b",
        content_hash: content_hash,
        generated_at: 1.day.ago
      )
    end

    def messages
      broadcasts(EntrySummaryChannel.stream_name_for(@entry.id)).map { |m| ActiveSupport::JSON.decode(m) }
    end

    def last_message
      messages.last
    end

    # The states seen on the entry's stream, in order.
    def states
      messages.map { |m| m["state"] }
    end

    class StubSummarizer
      attr_reader :calls

      def initialize(result: nil, raise: nil)
        @result = result
        @raise = raise
        @calls = 0
      end

      def summarize(_entry)
        @calls += 1
        Kernel.raise(@raise) if @raise

        @result
      end
    end
end
