require "test_helper"

class AnalyzeStoryJobTest < ActiveJob::TestCase
  setup do
    @story = stories(:active_story)
    @story.story_analyses.delete_all
    @story.story_articles.delete_all
    @fresh_article = @story.story_articles.create!(
      url: "https://example.com/fresh",
      title: "Fresh article",
      snippet: "Something happened today.",
      source: "example.com",
      published_at: 2.hours.ago,
      fetched_at: 1.hour.ago
    )
    @original_factory = AnalyzeStoryJob.analyzer_factory
  end

  teardown do
    AnalyzeStoryJob.analyzer_factory = @original_factory
  end

  def stub_analyzer(result: nil, raise: nil)
    analyzer = StubAnalyzer.new(result: result, raise: raise)
    AnalyzeStoryJob.analyzer_factory = -> { analyzer }
    analyzer
  end

  test "creates a story_analysis row and records the article ids" do
    stub_analyzer(result: analyzer_result(new_development: false))

    assert_difference -> { @story.story_analyses.count }, 1 do
      AnalyzeStoryJob.perform_now(@story.id)
    end

    analysis = @story.story_analyses.order(created_at: :desc).first
    assert_equal false, analysis.new_development
    assert_equal false, analysis.concluded
    assert_equal "Update label", analysis.timeline_label
    assert_equal "Updated summary text.", analysis.summary
    assert_equal [ @fresh_article.id ], analysis.article_ids
  end

  test "updates story.summary when new_development is true" do
    original_summary = @story.summary
    stub_analyzer(result: analyzer_result(
      new_development: true,
      updated_summary: "Big new development summary."
    ))

    AnalyzeStoryJob.perform_now(@story.id)

    @story.reload
    assert_equal "Big new development summary.", @story.summary
    refute_equal original_summary, @story.summary
  end

  test "does not change story.summary when new_development is false" do
    original = @story.summary
    stub_analyzer(result: analyzer_result(
      new_development: false,
      updated_summary: "Should not overwrite."
    ))

    AnalyzeStoryJob.perform_now(@story.id)

    assert_equal original, @story.reload.summary
  end

  test "marks story concluded when result.concluded is true" do
    stub_analyzer(result: analyzer_result(concluded: true))

    freeze_time do
      AnalyzeStoryJob.perform_now(@story.id)
      @story.reload
      assert_equal "concluded", @story.status
      assert_equal Time.current, @story.concluded_at
    end
  end

  test "only sends articles since the last analysis" do
    # Prior analysis existed an hour ago
    @story.story_analyses.create!(
      new_development: false,
      concluded: false,
      timeline_label: "Prior",
      summary: "prior",
      rationale: "r",
      article_ids: [],
      created_at: 90.minutes.ago
    )

    old_article = @story.story_articles.create!(
      url: "https://example.com/old",
      title: "Old",
      snippet: "old",
      source: "Ex",
      published_at: 3.days.ago,
      fetched_at: 3.days.ago
    )

    analyzer = stub_analyzer(result: analyzer_result(new_development: false))
    AnalyzeStoryJob.perform_now(@story.id)

    assert_equal [ @fresh_article.id ], analyzer.last_new_articles.map(&:id)
    refute_includes analyzer.last_new_articles.map(&:id), old_article.id
  end

  test "skips when no new articles and story is not stale" do
    # A recent analysis exists
    @story.story_analyses.create!(
      new_development: false,
      concluded: false,
      timeline_label: "Prior",
      summary: "prior",
      rationale: "r",
      article_ids: [],
      created_at: 1.hour.ago
    )
    # Move the fresh article to before the analysis so nothing is "new"
    @fresh_article.update!(fetched_at: 2.hours.ago, published_at: 2.hours.ago)

    analyzer = stub_analyzer(result: analyzer_result)

    assert_no_difference -> { @story.story_analyses.count } do
      AnalyzeStoryJob.perform_now(@story.id)
    end
    assert_nil analyzer.last_new_articles, "analyzer should not be invoked"
  end

  test "runs even with no new articles when story is stale (14+ days quiet)" do
    # Previous analysis and only-article are both 15 days old
    @fresh_article.update!(fetched_at: 15.days.ago, published_at: 15.days.ago)
    @story.story_analyses.create!(
      new_development: false,
      concluded: false,
      timeline_label: "Prior",
      summary: "prior",
      rationale: "r",
      article_ids: [],
      created_at: 15.days.ago
    )

    analyzer = stub_analyzer(result: analyzer_result(concluded: true))

    assert_difference -> { @story.story_analyses.count }, 1 do
      AnalyzeStoryJob.perform_now(@story.id)
    end

    assert_equal [], analyzer.last_new_articles
    assert_equal "concluded", @story.reload.status
  end

  test "skips concluded stories" do
    concluded = stories(:concluded_story)
    analyzer = stub_analyzer(result: analyzer_result)

    assert_no_difference -> { StoryAnalysis.where(story_id: concluded.id).count } do
      AnalyzeStoryJob.perform_now(concluded.id)
    end
    assert_nil analyzer.last_new_articles
  end

  test "ignores missing story id" do
    analyzer = stub_analyzer(result: analyzer_result)

    assert_nothing_raised do
      AnalyzeStoryJob.perform_now(0)
    end
    assert_nil analyzer.last_new_articles
  end

  # CATCHER for the retry_on/discard_on ordering bug: ActiveSupport::Rescuable
  # searches rescue_handlers in reverse declaration order, so a
  # `discard_on LlmClient::Unreachable` declared below the `retry_on` for the
  # same class wins outright and the retries never run. This asserts the
  # analyzer is actually invoked ATTEMPTS times; with the discard_on back in
  # place it is invoked once and this fails 1 != 3.
  test "retries LlmClient::Unreachable up to the declared attempts" do
    analyzer = stub_analyzer(raise: LlmClient::Unreachable.new("baru down"))

    perform_enqueued_jobs do
      AnalyzeStoryJob.perform_later(@story.id)
    end

    assert_equal 3, analyzer.call_count,
      "expected the analyzer to be invoked once per declared attempt"
  end

  # CATCHER, via a different mechanism than the one above: after the first
  # failure a retry must be sitting in the queue. A discard leaves the queue
  # empty, so this fails when discard_on wins.
  test "enqueues a retry after the first LlmClient::Unreachable failure" do
    stub_analyzer(raise: LlmClient::Unreachable.new("baru down"))

    assert_enqueued_with(job: AnalyzeStoryJob, args: [ @story.id ]) do
      AnalyzeStoryJob.perform_now(@story.id)
    end
  end

  # CATCHER: the give-up warning belongs on the LAST attempt only. When
  # discard_on wins it is logged on the first failure, so the pairing of
  # "one warning" with "three invocations" does not hold.
  test "logs the give-up warning once, after the final attempt" do
    analyzer = stub_analyzer(raise: LlmClient::Unreachable.new("baru down"))

    logged = capture_rails_log do
      perform_enqueued_jobs do
        AnalyzeStoryJob.perform_later(@story.id)
      end
    end

    assert_equal 3, analyzer.call_count
    assert_equal 1, logged.scan(/giving up after retries/).size,
      "expected exactly one give-up warning, emitted after the last attempt"
    assert_match(/Ollama unreachable/, logged)
    assert_match(/story #{@story.id} giving up/, logged)
  end

  # GUARD (passes before and after the fix): giving up must be a discard, not a
  # failure. Nothing raises out, and no partial analysis row is written.
  test "gives up quietly rather than failing when Ollama stays unreachable" do
    stub_analyzer(raise: LlmClient::Unreachable.new("baru down"))

    assert_no_difference -> { @story.story_analyses.count } do
      assert_nothing_raised do
        perform_enqueued_jobs do
          AnalyzeStoryJob.perform_later(@story.id)
        end
      end
    end

    @story.reload
    assert_equal "active", @story.status
  end

  test "does not change summary or status when analyzer raises" do
    original_summary = @story.summary
    stub_analyzer(raise: StoryAnalyzer::AnalysisFailed.new("bad"))

    assert_raises(StoryAnalyzer::AnalysisFailed) do
      AnalyzeStoryJob.perform_now(@story.id)
    end

    @story.reload
    assert_equal original_summary, @story.summary
    assert_equal "active", @story.status
    assert_equal 0, @story.story_analyses.count
  end

  private

  def capture_rails_log
    buffer = StringIO.new
    original_logger = Rails.logger
    Rails.logger = Logger.new(buffer)
    yield
    buffer.string
  ensure
    Rails.logger = original_logger
  end

  def analyzer_result(new_development: false, concluded: false, updated_summary: "Updated summary text.")
    {
      new_development: new_development,
      concluded: concluded,
      timeline_label: "Update label",
      updated_summary: updated_summary,
      rationale: "because"
    }
  end

  class StubAnalyzer
    attr_reader :last_story, :last_new_articles, :call_count

    def initialize(result: nil, raise: nil)
      @result = result
      @raise = raise
      @call_count = 0
    end

    def analyze(story, new_articles:)
      @call_count += 1
      @last_story = story
      @last_new_articles = new_articles
      raise @raise if @raise

      @result
    end
  end
end
