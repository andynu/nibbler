require "test_helper"

class StoryAnalyzerTest < ActiveSupport::TestCase
  setup do
    @story = stories(:active_story)
    @article = @story.story_articles.first || @story.story_articles.create!(
      url: "https://example.com/a",
      title: "A",
      snippet: "snippet",
      source: "Ex",
      published_at: 1.day.ago,
      fetched_at: 1.hour.ago
    )
  end

  test "returns normalized hash from LLM JSON response" do
    fake = FakeLlmClient.new(response: {
      "new_development"  => true,
      "concluded"        => false,
      "timeline_label"   => "SEC publishes final rule",
      "updated_summary"  => "The SEC finalized the framework.",
      "rationale"        => "Multiple outlets confirm."
    })

    result = StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])

    assert_equal true,  result[:new_development]
    assert_equal false, result[:concluded]
    assert_equal "SEC publishes final rule", result[:timeline_label]
    assert_equal "The SEC finalized the framework.", result[:updated_summary]
    assert_equal "Multiple outlets confirm.", result[:rationale]
  end

  test "forces new_development=false when no new articles (no-new-articles rule)" do
    fake = FakeLlmClient.new(response: {
      "new_development"  => true, # LLM tries to say true; we override
      "concluded"        => true,
      "timeline_label"   => "No new coverage",
      "updated_summary"  => "Still nothing new.",
      "rationale"        => "14 days quiet."
    })

    result = StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [])

    assert_equal false, result[:new_development]
    assert_equal true,  result[:concluded]
  end

  test "requests JSON format from LLM" do
    fake = FakeLlmClient.new(response: valid_response)
    StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    assert_equal :json, fake.last_format
  end

  test "prompt with new articles includes story name, summary and article details" do
    fake = FakeLlmClient.new(response: valid_response)
    StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])

    prompt = fake.last_prompt
    assert_includes prompt, @story.name
    assert_includes prompt, @story.summary
    assert_includes prompt, @article.title
    assert_includes prompt, @article.source
  end

  test "prompt with no new articles uses the stale-check template" do
    fake = FakeLlmClient.new(response: valid_response)
    StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [])

    prompt = fake.last_prompt
    assert_includes prompt, "No new articles have arrived"
    assert_includes prompt, @story.name
  end

  test "caps number of articles included in prompt" do
    articles = Array.new(StoryAnalyzer::MAX_ARTICLES_IN_PROMPT + 5) do |i|
      @story.story_articles.create!(
        url: "https://example.com/bulk-#{i}",
        title: "Bulk #{i}",
        snippet: "s",
        source: "Ex",
        published_at: (i + 1).hours.ago,
        fetched_at: Time.current
      )
    end

    fake = FakeLlmClient.new(response: valid_response)
    StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: articles)

    # Oldest articles (those beyond the cap) shouldn't appear
    prompt = fake.last_prompt
    refute_includes prompt, articles.last.title, "oldest article should be trimmed"
    assert_includes prompt, articles.first.title, "newest article should remain"
  end

  test "truncates long snippets" do
    long = "x" * (StoryAnalyzer::SNIPPET_CHAR_LIMIT + 500)
    article = @story.story_articles.create!(
      url: "https://example.com/long",
      title: "Long",
      snippet: long,
      source: "Ex",
      published_at: 1.hour.ago,
      fetched_at: Time.current
    )

    fake = FakeLlmClient.new(response: valid_response)
    StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ article ])

    # Prompt contains a truncation marker rather than the raw long string
    assert_includes fake.last_prompt, "..."
    refute_includes fake.last_prompt, long
  end

  test "raises AnalysisFailed when timeline_label is blank" do
    fake = FakeLlmClient.new(response: valid_response.merge("timeline_label" => ""))

    assert_raises(StoryAnalyzer::AnalysisFailed) do
      StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    end
  end

  test "raises AnalysisFailed when updated_summary is blank" do
    fake = FakeLlmClient.new(response: valid_response.merge("updated_summary" => "  "))

    assert_raises(StoryAnalyzer::AnalysisFailed) do
      StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    end
  end

  test "raises AnalysisFailed when response is not a hash" do
    fake = FakeLlmClient.new(response: "nope")

    assert_raises(StoryAnalyzer::AnalysisFailed) do
      StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    end
  end

  test "wraps BadJson as AnalysisFailed" do
    fake = FakeLlmClient.new(raise: LlmClient::BadJson.new("bad"))

    assert_raises(StoryAnalyzer::AnalysisFailed) do
      StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    end
  end

  test "lets Unreachable errors propagate" do
    fake = FakeLlmClient.new(raise: LlmClient::Unreachable.new("down"))

    assert_raises(LlmClient::Unreachable) do
      StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])
    end
  end

  test "coerces truthy string booleans" do
    fake = FakeLlmClient.new(response: valid_response.merge(
      "new_development" => "true",
      "concluded"       => "yes"
    ))

    result = StoryAnalyzer.new(llm_client: fake).analyze(@story, new_articles: [ @article ])

    assert_equal true, result[:new_development]
    assert_equal true, result[:concluded]
  end

  private

  def valid_response
    {
      "new_development"  => false,
      "concluded"        => false,
      "timeline_label"   => "Status check",
      "updated_summary"  => "No significant changes.",
      "rationale"        => "Same players, same facts."
    }
  end

  class FakeLlmClient
    attr_reader :last_prompt, :last_format

    def initialize(response: nil, raise: nil)
      @response = response
      @raise = raise
    end

    def generate(prompt:, format: nil, timeout: nil)
      @last_prompt = prompt
      @last_format = format
      raise @raise if @raise

      @response
    end
  end
end
