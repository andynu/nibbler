require "test_helper"

class StoryWrapupGeneratorTest < ActiveSupport::TestCase
  setup do
    @story = stories(:concluded_story)
    @article = @story.story_articles.create!(
      url: "https://example.com/a",
      title: "Wrapped Launch",
      snippet: "Spotify launched Wrapped...",
      source: "Example",
      published_at: 3.days.ago,
      fetched_at: 2.days.ago
    )
    @analysis = @story.story_analyses.create!(
      new_development: true,
      concluded: true,
      timeline_label: "Launch complete",
      summary: "The rollout is done.",
      rationale: "All users received the experience.",
      article_ids: [ @article.id ],
      created_at: 1.day.ago
    )
  end

  test "returns the LLM's raw narrative string" do
    fake = FakeLlmClient.new(response: "# Spotify Wrapped\n\nThe story goes...")
    narrative = StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    assert_equal "# Spotify Wrapped\n\nThe story goes...", narrative
  end

  test "strips surrounding whitespace" do
    fake = FakeLlmClient.new(response: "   # Title\n\nBody.   \n")
    narrative = StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    assert_equal "# Title\n\nBody.", narrative
  end

  test "does NOT request JSON format from LLM (wants prose)" do
    fake = FakeLlmClient.new(response: "ok")
    StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    assert_nil fake.last_format, "wrapup should be plain text, not JSON"
  end

  test "prompt includes story name, status, articles and analyses" do
    fake = FakeLlmClient.new(response: "narrative")
    StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    prompt = fake.last_prompt
    assert_includes prompt, @story.name
    assert_includes prompt, @article.title
    assert_includes prompt, @analysis.timeline_label
    assert_includes prompt, @analysis.summary
    assert_match(/concluded/i, prompt)
  end

  test "prompt shows active status for active stories" do
    active = stories(:active_story)
    fake = FakeLlmClient.new(response: "narrative")
    StoryWrapupGenerator.new(llm_client: fake).generate(active)

    assert_match(/Status: active/, fake.last_prompt)
  end

  test "caps the number of articles included" do
    articles = Array.new(StoryWrapupGenerator::MAX_ARTICLES_IN_PROMPT + 10) do |i|
      @story.story_articles.create!(
        url: "https://example.com/bulk-#{i}",
        title: "Bulk #{i}",
        snippet: "s",
        source: "Ex",
        published_at: (i + 10).days.ago,
        fetched_at: (i + 9).days.ago
      )
    end

    fake = FakeLlmClient.new(response: "narrative")
    StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    # Oldest (highest i) articles should be dropped; newest kept.
    prompt = fake.last_prompt
    refute_includes prompt, articles.last.title, "oldest article should be trimmed"
    assert_includes prompt, articles.first.title, "newest article should remain"
  end

  test "truncates long article snippets" do
    long = "y" * (StoryWrapupGenerator::SNIPPET_CHAR_LIMIT + 500)
    @story.story_articles.create!(
      url: "https://example.com/long",
      title: "Long",
      snippet: long,
      source: "Ex",
      published_at: 1.hour.ago,
      fetched_at: Time.current
    )

    fake = FakeLlmClient.new(response: "narrative")
    StoryWrapupGenerator.new(llm_client: fake).generate(@story)

    assert_includes fake.last_prompt, "..."
    refute_includes fake.last_prompt, long
  end

  test "raises WrapupFailed when LLM returns empty string" do
    fake = FakeLlmClient.new(response: "")

    assert_raises(StoryWrapupGenerator::WrapupFailed) do
      StoryWrapupGenerator.new(llm_client: fake).generate(@story)
    end
  end

  test "raises WrapupFailed when LLM returns only whitespace" do
    fake = FakeLlmClient.new(response: "   \n  \t  ")

    assert_raises(StoryWrapupGenerator::WrapupFailed) do
      StoryWrapupGenerator.new(llm_client: fake).generate(@story)
    end
  end

  test "lets Unreachable errors propagate" do
    fake = FakeLlmClient.new(raise: LlmClient::Unreachable.new("down"))

    assert_raises(LlmClient::Unreachable) do
      StoryWrapupGenerator.new(llm_client: fake).generate(@story)
    end
  end

  test "handles stories with no analyses gracefully" do
    bare = @story.user.stories.create!(name: "Bare", queries: [ "q" ], status: "active")
    fake = FakeLlmClient.new(response: "narrative")

    StoryWrapupGenerator.new(llm_client: fake).generate(bare)

    assert_match(/\(none\)/, fake.last_prompt)
  end

  private

  class FakeLlmClient
    attr_reader :last_prompt, :last_format, :last_timeout

    def initialize(response: nil, raise: nil)
      @response = response
      @raise = raise
    end

    def generate(prompt:, format: nil, timeout: nil)
      @last_prompt = prompt
      @last_format = format
      @last_timeout = timeout
      Kernel.raise(@raise) if @raise

      @response
    end
  end
end
