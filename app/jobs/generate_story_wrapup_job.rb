# Generates a narrative wrapup for a concluded Story and persists it.
#
# Calls StoryWrapupGenerator to produce a markdown narrative summarizing the
# story arc, then writes it to `story.wrapup` with a `story.wrapup_generated_at`
# timestamp. Safe to re-run — subsequent runs overwrite the previous wrapup,
# which is useful if new analyses land after the initial wrapup.
#
# This job is intentionally separate from AnalyzeStoryJob because:
# - Wrapups are expensive (full history, longer output)
# - Wrapups only make sense once a story has concluded
# - They are user-triggered via the UI, not part of the periodic analyze cycle
#
# @see StoryWrapupGenerator for prompt construction and LLM invocation
# @see Api::V1::StoriesController#wrapup for the endpoint that enqueues this job
class GenerateStoryWrapupJob < ApplicationJob
  queue_as :default

  # Retry on transient network errors with exponential backoff. Don't retry
  # on WrapupFailed — an empty response means the model chose not to produce
  # output; the next manual trigger will try again.
  retry_on LlmClient::Unreachable, wait: :polynomially_longer, attempts: 3

  # Tests can override this to inject a stub generator without going through
  # ActiveJob serialization.
  class << self
    attr_writer :generator_factory

    def generator_factory
      @generator_factory ||= -> { StoryWrapupGenerator.new }
    end
  end

  def perform(story_id)
    story = Story.find_by(id: story_id)
    return unless story

    narrative = self.class.generator_factory.call.generate(story)

    story.update!(
      wrapup: narrative,
      wrapup_generated_at: Time.current
    )

    Rails.logger.info(
      "GenerateStoryWrapupJob: story #{story.id} (#{story.name}) wrapup generated " \
      "length=#{narrative.bytesize}B"
    )
    narrative
  end
end
