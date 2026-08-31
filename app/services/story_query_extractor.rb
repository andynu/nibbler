# Extracts a topic name and follow-up search queries from an Entry using an LLM.
#
# Given an article's title and a short excerpt, asks the model to produce a
# concise topic label and ~3 Google-News-style search queries that would
# surface continuing coverage of the same story.
#
# @example
#   result = StoryQueryExtractor.new.extract(entry)
#   result[:topic]    # => "SEC crypto regulation 2026"
#   result[:queries]  # => ["SEC crypto regulation", "crypto enforcement 2026", ...]
#
# The LLM is expected to return strict JSON like:
#   {"topic": "...", "queries": ["q1", "q2", "q3"]}
#
# @see LlmClient for the underlying HTTP client
# @see Story for the record created from extraction results
class StoryQueryExtractor
  # Raised when the extractor cannot produce a valid result (bad JSON,
  # missing fields, or LLM unreachable after attempting). Callers should
  # typically surface this as a user-facing "try again" error.
  class ExtractionFailed < StandardError; end

  # Maximum characters of entry content to include in the prompt. Keeps the
  # request small for latency and to stay well inside context limits.
  EXCERPT_CHAR_LIMIT = 1500

  # Maximum number of queries to keep from the LLM's response.
  MAX_QUERIES = 5

  def initialize(llm_client: LlmClient.new)
    @llm_client = llm_client
  end

  # Extract a topic name and follow-up queries from an Entry.
  #
  # @param entry [Entry] the source article
  # @return [Hash] `{ topic: String, queries: Array<String> }`
  # @raise [ExtractionFailed] if the LLM response is unusable
  # @raise [LlmClient::Unreachable] if Ollama is down
  def extract(entry)
    prompt = build_prompt(entry)
    response = @llm_client.generate(prompt: prompt, format: :json)

    topic = response["topic"].to_s.strip
    queries = Array(response["queries"]).map { |q| q.to_s.strip }.reject(&:empty?).first(MAX_QUERIES)

    if topic.empty? || queries.empty?
      raise ExtractionFailed, "LLM returned unusable extraction: #{response.inspect[0, 300]}"
    end

    { topic: topic, queries: queries }
  rescue LlmClient::BadJson => e
    raise ExtractionFailed, "LLM did not return valid JSON: #{e.message}"
  end

  private

  def build_prompt(entry)
    excerpt = build_excerpt(entry)
    <<~PROMPT
      You are helping a news reader track ongoing stories. Given a single article, produce:

      1. A concise "topic" label (3-8 words) naming the ongoing story this article covers.
      2. A list of 3 short search queries (each 2-6 words) that would find continuing coverage of the same story on Google News.

      Rules:
      - Topic must be specific enough to distinguish from unrelated stories, but general enough to match future coverage.
      - Queries should vary in angle (e.g. entity name, event type, related actors).
      - Do NOT include the article's publication date in the topic or queries.
      - Return ONLY valid JSON with keys: "topic" (string) and "queries" (array of strings). No prose, no code fences.

      Article title: #{entry.title}

      Article excerpt:
      #{excerpt}
    PROMPT
  end

  def build_excerpt(entry)
    ArticleText.from_html(entry.content).truncate(EXCERPT_CHAR_LIMIT, omission: "...")
  end
end
