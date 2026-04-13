# Builds and executes the Ollama "analyze" call for a Story.
#
# Given a Story and a set of "new" StoryArticles (articles gathered since the
# last analysis), asks the LLM to assess whether there's a new development,
# whether the story has concluded, and to produce a fresh summary and
# timeline label.
#
# The LLM is expected to return strict JSON with these keys:
#   {
#     "new_development":   boolean,
#     "concluded":         boolean,
#     "timeline_label":    String,   # short human-readable label (e.g. "SEC announces framework")
#     "updated_summary":   String,   # rewritten summary reflecting the new state
#     "rationale":         String    # model's reasoning, for the audit trail
#   }
#
# @example
#   result = StoryAnalyzer.new.analyze(story, new_articles: story.story_articles.to_a)
#   result[:new_development]  # => true
#   result[:updated_summary]  # => "..."
#
# @see LlmClient for the underlying HTTP client
# @see AnalyzeStoryJob for the caller that persists results and updates story state
class StoryAnalyzer
  # Raised when the LLM response cannot be turned into a usable analysis.
  class AnalysisFailed < StandardError; end

  # Maximum characters from each article's snippet to include in the prompt.
  # Keeps prompt size bounded when a story accumulates many articles.
  SNIPPET_CHAR_LIMIT = 400

  # Cap on the number of articles sent to the LLM. If more than this are
  # "new", only the most-recent by published_at are forwarded; the rest are
  # still recorded in the analysis.article_ids audit trail by the caller.
  MAX_ARTICLES_IN_PROMPT = 30

  def initialize(llm_client: LlmClient.new)
    @llm_client = llm_client
  end

  # Run the analysis for a Story.
  #
  # @param story [Story]
  # @param new_articles [Array<StoryArticle>] articles newer than the last analysis
  # @return [Hash] analysis result with symbolized keys:
  #   :new_development, :concluded, :timeline_label, :updated_summary, :rationale
  # @raise [AnalysisFailed] if the response is unparseable or missing required fields
  # @raise [LlmClient::Unreachable] if Ollama is down (propagated)
  def analyze(story, new_articles:)
    prompt =
      if new_articles.empty?
        build_no_new_articles_prompt(story)
      else
        build_prompt(story, new_articles)
      end

    response = @llm_client.generate(prompt: prompt, format: :json)
    normalize(response, has_new_articles: new_articles.any?)
  rescue LlmClient::BadJson => e
    raise AnalysisFailed, "LLM did not return valid JSON: #{e.message}"
  end

  private

  def build_prompt(story, new_articles)
    <<~PROMPT
      You are tracking an ongoing news story. Below is the current summary of
      the story, followed by newly gathered articles. Decide whether these
      articles represent a new development, whether the story appears to have
      concluded, and produce an updated summary.

      Return ONLY valid JSON with these keys and no other text:
      {
        "new_development": boolean,   // true if these articles add meaningful new information
        "concluded":       boolean,   // true if the story looks wrapped up (final ruling, event over, etc.)
        "timeline_label":  string,    // 3-10 word label for this update (e.g. "SEC publishes final rule")
        "updated_summary": string,    // 1-3 sentence summary reflecting the current state
        "rationale":       string     // brief reasoning for your decision
      }

      Story name: #{story.name}

      Current summary:
      #{story.summary.to_s.strip.presence || '(no prior summary)'}

      Days since previous analysis: #{days_since_last_analysis(story)}
      Days since most recent article: #{days_since_most_recent_article(new_articles)}

      New articles (#{new_articles.size} total, showing up to #{MAX_ARTICLES_IN_PROMPT}):
      #{format_articles(new_articles)}
    PROMPT
  end

  def build_no_new_articles_prompt(story)
    <<~PROMPT
      You are tracking an ongoing news story. No new articles have arrived in
      the last 14 days. Based on the summary below alone, decide whether this
      story has likely concluded (no further developments expected).

      Return ONLY valid JSON with these keys and no other text:
      {
        "new_development": false,
        "concluded":       boolean,   // true if the story appears to have run its course
        "timeline_label":  string,    // short label for this analysis (e.g. "No new coverage")
        "updated_summary": string,    // may be the same as the current summary
        "rationale":       string     // brief reasoning
      }

      Story name: #{story.name}

      Current summary:
      #{story.summary.to_s.strip.presence || '(no prior summary)'}

      Days since most recent article: #{days_since_most_recent_story_article(story)}
    PROMPT
  end

  def format_articles(articles)
    articles
      .sort_by { |a| a.published_at || a.fetched_at || Time.at(0) }
      .reverse
      .first(MAX_ARTICLES_IN_PROMPT)
      .map { |a| format_article(a) }
      .join("\n\n")
  end

  def format_article(article)
    date = (article.published_at || article.fetched_at)&.utc&.strftime("%Y-%m-%d") || "(undated)"
    snippet = article.snippet.to_s.strip.truncate(SNIPPET_CHAR_LIMIT, omission: "...")
    <<~ARTICLE.strip
      - [#{date}] #{article.title} (#{article.source})
        #{snippet}
    ARTICLE
  end

  def days_since_last_analysis(story)
    last = story.story_analyses.order(created_at: :desc).first
    return "(none)" unless last

    ((Time.current - last.created_at) / 1.day).round
  end

  def days_since_most_recent_article(new_articles)
    most_recent = new_articles.map { |a| a.published_at || a.fetched_at }.compact.max
    return "(unknown)" unless most_recent

    ((Time.current - most_recent) / 1.day).round
  end

  def days_since_most_recent_story_article(story)
    most_recent = story.story_articles
                       .maximum(:published_at) ||
                  story.story_articles.maximum(:fetched_at)
    return "(unknown)" unless most_recent

    ((Time.current - most_recent) / 1.day).round
  end

  def normalize(response, has_new_articles:)
    unless response.is_a?(Hash)
      raise AnalysisFailed, "LLM response was not a JSON object: #{response.inspect[0, 200]}"
    end

    timeline_label = response["timeline_label"].to_s.strip
    updated_summary = response["updated_summary"].to_s.strip

    if timeline_label.empty? || updated_summary.empty?
      raise AnalysisFailed,
        "LLM response missing timeline_label or updated_summary: #{response.inspect[0, 300]}"
    end

    {
      new_development: has_new_articles && to_bool(response["new_development"]),
      concluded: to_bool(response["concluded"]),
      timeline_label: timeline_label,
      updated_summary: updated_summary,
      rationale: response["rationale"].to_s.strip
    }
  end

  def to_bool(value)
    return false if value.nil?
    return value if value == true || value == false

    %w[true yes 1].include?(value.to_s.downcase.strip)
  end
end
