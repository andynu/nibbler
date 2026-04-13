# Runs StoryAnalyzer for a single Story and persists the result.
#
# Finds StoryArticles newer than the latest StoryAnalysis (or all articles if
# no prior analysis) and asks the LLM whether they represent a new development,
# whether the story has concluded, and for an updated summary.
#
# State updates:
# - Always insert a StoryAnalysis row (audit trail, even when no new development)
# - If new_development: update story.summary to the LLM's updated_summary
# - If concluded: set story.status="concluded", story.concluded_at=now
#
# No-new-articles rule: if the most recent StoryArticle is older than
# STALE_THRESHOLD (14 days) and there's been no analysis since it arrived,
# we still run analyze (asking "has this concluded?") so long-quiet stories
# don't linger as "active" forever.
#
# @see StoryAnalyzer for prompt construction and response parsing
# @see AnalyzeStoriesJob for the scheduler that enqueues one per active Story
class AnalyzeStoryJob < ApplicationJob
  queue_as :default

  # If no new articles in this many days, still run analyze to check for conclusion.
  STALE_THRESHOLD = 14.days

  # Retry on transient errors with exponential backoff. Don't retry on
  # AnalysisFailed — that's a deterministic "bad LLM response" and retrying
  # won't help; the next scheduled run will try again with fresh context.
  retry_on LlmClient::Unreachable, wait: :polynomially_longer, attempts: 3

  # Tests can override this to inject a stub analyzer without going through
  # ActiveJob serialization.
  class << self
    attr_writer :analyzer_factory

    def analyzer_factory
      @analyzer_factory ||= -> { StoryAnalyzer.new }
    end
  end

  def perform(story_id)
    story = Story.find_by(id: story_id)
    return unless story
    return unless story.active?

    new_articles = articles_since_last_analysis(story)

    if new_articles.empty? && !stale_enough_for_check?(story)
      Rails.logger.info "AnalyzeStoryJob: story #{story.id} has no new articles and isn't stale, skipping"
      return
    end

    result = self.class.analyzer_factory.call.analyze(story, new_articles: new_articles)

    ActiveRecord::Base.transaction do
      persist_analysis(story, result, new_articles)
      apply_story_updates(story, result)
    end

    Rails.logger.info(
      "AnalyzeStoryJob: story #{story.id} (#{story.name}) analyzed " \
      "new_articles=#{new_articles.size} new_development=#{result[:new_development]} " \
      "concluded=#{result[:concluded]}"
    )
    result
  end

  private

  def articles_since_last_analysis(story)
    last = story.story_analyses.order(created_at: :desc).first
    scope = story.story_articles.reorder(:id)
    return scope.to_a unless last

    scope.where("fetched_at > ? OR published_at > ?", last.created_at, last.created_at).to_a
  end

  def stale_enough_for_check?(story)
    # Only check stale-status for stories that have at least one article.
    # A brand-new story with no articles will be picked up once articles arrive.
    most_recent_article_time = story.story_articles.maximum(:published_at) ||
                               story.story_articles.maximum(:fetched_at)
    return false unless most_recent_article_time

    last_analysis = story.story_analyses.order(created_at: :desc).first
    reference_time = last_analysis&.created_at || most_recent_article_time

    (Time.current - reference_time) >= STALE_THRESHOLD
  end

  def persist_analysis(story, result, new_articles)
    story.story_analyses.create!(
      new_development: result[:new_development],
      concluded: result[:concluded],
      timeline_label: result[:timeline_label],
      summary: result[:updated_summary],
      rationale: result[:rationale],
      article_ids: new_articles.map(&:id),
      created_at: Time.current
    )
  end

  def apply_story_updates(story, result)
    attrs = {}
    attrs[:summary] = result[:updated_summary] if result[:new_development]
    if result[:concluded] && !story.concluded?
      attrs[:status] = "concluded"
      attrs[:concluded_at] = Time.current
    end
    story.update!(attrs) if attrs.any?
  end
end
