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

  test "discards rather than failing after retries exhausted on LlmClient::Unreachable" do
    stub_analyzer(raise: LlmClient::Unreachable.new("baru down"))

    # discard_on swallows the exception after retries are exhausted. In perform_now
    # with no retry queue, discard_on triggers immediately (bypassing retry_on's
    # requeue path), so the job completes without raising and without persisting.
    logged = StringIO.new
    original_logger = Rails.logger
    Rails.logger = Logger.new(logged)

    begin
      assert_no_difference -> { @story.story_analyses.count } do
        AnalyzeStoryJob.perform_now(@story.id)
      end
    ensure
      Rails.logger = original_logger
    end

    assert_match(/giving up after retries/, logged.string)
    assert_match(/Ollama unreachable/, logged.string)
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
    attr_reader :last_story, :last_new_articles

    def initialize(result: nil, raise: nil)
      @result = result
      @raise = raise
    end

    def analyze(story, new_articles:)
      @last_story = story
      @last_new_articles = new_articles
      raise @raise if @raise

      @result
    end
  end
end
