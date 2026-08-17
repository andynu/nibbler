# Builds and executes the Ollama "wrapup" call for a concluded Story.
#
# Given a Story with its full analysis history (and articles), asks the LLM
# to produce a narrative markdown summary of the entire story arc — from
# beginning to end, covering what happened, how it developed over time, and
# how it concluded. Intended for stories whose status is "concluded".
#
# Unlike StoryAnalyzer (which returns structured JSON), this service asks
# for prose markdown and returns it verbatim.
#
# @example
#   narrative = StoryWrapupGenerator.new.generate(story)
#   narrative # => "# SEC Crypto Regulation 2026\n\nIn early 2026..."
#
# @see LlmClient for the underlying HTTP client
# @see GenerateStoryWrapupJob for the job wrapper that persists the result
class StoryWrapupGenerator
  # Raised when the LLM response is empty or otherwise unusable.
  class WrapupFailed < StandardError; end

  # Maximum characters from each article's snippet to include in the prompt.
  SNIPPET_CHAR_LIMIT = 300

  # Cap on the number of articles sent to the LLM. If a story has accumulated
  # more than this, the oldest ones are trimmed (we keep the most recent,
  # which typically have the most informative conclusions).
  MAX_ARTICLES_IN_PROMPT = 40

  # Wrapup prompts tend to produce longer output than analyze; allow extra
  # time for the LLM to stream its response.
  DEFAULT_TIMEOUT = 180

  def initialize(llm_client: LlmClient.new)
    @llm_client = llm_client
  end

  # Generate a narrative wrapup for a story.
  #
  # @param story [Story]
  # @return [String] markdown narrative summary
  # @raise [WrapupFailed] if the LLM returns an empty or whitespace response
  # @raise [LlmClient::Unreachable] if Ollama is down (propagated)
  def generate(story)
    prompt = build_prompt(story)
    response = @llm_client.generate(prompt: prompt, timeout: DEFAULT_TIMEOUT)
    narrative = response.to_s.strip

    if narrative.empty?
      raise WrapupFailed, "LLM returned an empty wrapup for story #{story.id}"
    end

    narrative
  end

  private

  def build_prompt(story)
    analyses = story.story_analyses.order(created_at: :asc).to_a
    total_articles = story.story_articles.count
    # Keep the newest articles (most informative for concluded stories),
    # but display them oldest-first in the prompt for narrative flow.
    articles = story.story_articles.order(
      Arel.sql("COALESCE(published_at, fetched_at) DESC")
    ).limit(MAX_ARTICLES_IN_PROMPT).to_a.reverse

    <<~PROMPT
      Write a comprehensive narrative summary of the following news story, from
      beginning to end. Cover what happened, how it developed over time, and
      how it concluded. Write in a clear, factual style suitable for someone
      who missed the story entirely.

      Use markdown. Start with a single-line H1 heading containing the story
      name. Then write the narrative in prose paragraphs. Do not include a
      bulleted timeline, JSON, or commentary about the prompt itself.

      Story name: #{story.name}
      #{status_line(story)}

      Current summary:
      #{story.summary.to_s.strip.presence || '(no prior summary)'}

      Timeline of analyses (#{analyses.size} entries, oldest first):
      #{format_analyses(analyses)}

      Articles (#{total_articles} total, showing up to #{MAX_ARTICLES_IN_PROMPT} most recent, oldest first):
      #{format_articles(articles)}

      Write the narrative summary now. Markdown only. No preamble.
    PROMPT
  end

  def status_line(story)
    return "Status: active" unless story.concluded?

    concluded = story.concluded_at&.utc&.strftime("%Y-%m-%d") || "(unknown date)"
    "Status: concluded on #{concluded}"
  end

  def format_analyses(analyses)
    return "(none)" if analyses.empty?

    analyses.map { |a| format_analysis(a) }.join("\n\n")
  end

  def format_analysis(analysis)
    date = analysis.created_at&.utc&.strftime("%Y-%m-%d") || "(undated)"
    parts = [ "- [#{date}]" ]
    parts << "new_development" if analysis.new_development
    parts << "CONCLUDED" if analysis.concluded
    header = parts.join(" ")

    body = []
    body << "label: #{analysis.timeline_label}" if analysis.timeline_label.present?
    body << "summary: #{analysis.summary}" if analysis.summary.present?
    body << "rationale: #{analysis.rationale}" if analysis.rationale.present?
    [ header, *body.map { |line| "  #{line}" } ].join("\n")
  end

  def format_articles(articles)
    return "(none)" if articles.empty?

    articles.map { |a| format_article(a) }.join("\n\n")
  end

  def format_article(article)
    date = (article.published_at || article.fetched_at)&.utc&.strftime("%Y-%m-%d") || "(undated)"
    snippet = article.snippet.to_s.strip.truncate(SNIPPET_CHAR_LIMIT, omission: "...")
    source = article.source.presence || "(unknown source)"
    <<~ARTICLE.strip
      - [#{date}] #{article.title} (#{source})
        #{snippet}
    ARTICLE
  end
end
