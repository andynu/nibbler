require "test_helper"

class StoryQueryExtractorTest < ActiveSupport::TestCase
  def setup
    @entry = entries(:basic)
  end

  test "returns topic and queries from LLM JSON response" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "SEC crypto enforcement", "queries" => [ "SEC crypto", "crypto regulation 2026", "SEC chair crypto" ] }
    )
    extractor = StoryQueryExtractor.new(llm_client: fake_client)

    result = extractor.extract(@entry)

    assert_equal "SEC crypto enforcement", result[:topic]
    assert_equal [ "SEC crypto", "crypto regulation 2026", "SEC chair crypto" ], result[:queries]
  end

  test "strips whitespace from topic and queries" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "  Story Name  ", "queries" => [ "  q1  ", "q2" ] }
    )
    result = StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)

    assert_equal "Story Name", result[:topic]
    assert_equal [ "q1", "q2" ], result[:queries]
  end

  test "drops blank queries" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "t", "queries" => [ "real query", "", "   ", "another" ] }
    )
    result = StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)

    assert_equal [ "real query", "another" ], result[:queries]
  end

  test "caps queries at MAX_QUERIES" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "t", "queries" => %w[q1 q2 q3 q4 q5 q6 q7] }
    )
    result = StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)

    assert_equal StoryQueryExtractor::MAX_QUERIES, result[:queries].size
  end

  test "raises ExtractionFailed when topic is blank" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "", "queries" => [ "q1" ] }
    )
    assert_raises(StoryQueryExtractor::ExtractionFailed) do
      StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)
    end
  end

  test "raises ExtractionFailed when queries are empty" do
    fake_client = FakeLlmClient.new(
      response: { "topic" => "t", "queries" => [] }
    )
    assert_raises(StoryQueryExtractor::ExtractionFailed) do
      StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)
    end
  end

  test "wraps BadJson as ExtractionFailed" do
    fake_client = FakeLlmClient.new(raise: LlmClient::BadJson.new("bad"))
    assert_raises(StoryQueryExtractor::ExtractionFailed) do
      StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)
    end
  end

  test "lets Unreachable errors propagate" do
    fake_client = FakeLlmClient.new(raise: LlmClient::Unreachable.new("down"))
    assert_raises(LlmClient::Unreachable) do
      StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)
    end
  end

  test "prompt includes the article title" do
    fake_client = FakeLlmClient.new(response: { "topic" => "t", "queries" => [ "q" ] })
    StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)

    assert_includes fake_client.last_prompt, @entry.title
  end

  test "prompt strips HTML from content" do
    entry = @entry
    def entry.content
      "<p>Some <b>bold</b> text about the story.</p>"
    end
    fake_client = FakeLlmClient.new(response: { "topic" => "t", "queries" => [ "q" ] })

    StoryQueryExtractor.new(llm_client: fake_client).extract(entry)

    assert_includes fake_client.last_prompt, "Some bold text about the story."
    refute_includes fake_client.last_prompt, "<p>"
  end

  # strip_tags puts nothing in a removed tag's place, so the excerpt handed to
  # the model welded a word pair at every block boundary and left entities
  # encoded. The model then named the story after tokens the article does not
  # contain.
  test "prompt keeps a boundary between adjacent blocks and decodes entities" do
    entry = @entry
    def entry.content
      "<p>The vote failed.</p><p>Members left early.</p><p>AT&amp;T&nbsp;declined.</p>"
    end
    fake_client = FakeLlmClient.new(response: { "topic" => "t", "queries" => [ "q" ] })

    StoryQueryExtractor.new(llm_client: fake_client).extract(entry)

    assert_includes fake_client.last_prompt, "The vote failed. Members left early. AT&T declined."
    refute_includes fake_client.last_prompt, "&nbsp;"
  end

  test "requests JSON format from LLM" do
    fake_client = FakeLlmClient.new(response: { "topic" => "t", "queries" => [ "q" ] })
    StoryQueryExtractor.new(llm_client: fake_client).extract(@entry)

    assert_equal :json, fake_client.last_format
  end

  # Minimal stub for LlmClient.
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
