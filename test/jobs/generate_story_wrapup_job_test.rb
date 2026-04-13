require "test_helper"

class GenerateStoryWrapupJobTest < ActiveJob::TestCase
  setup do
    @story = stories(:concluded_story)
    @original_factory = GenerateStoryWrapupJob.generator_factory
  end

  teardown do
    GenerateStoryWrapupJob.generator_factory = @original_factory
  end

  def stub_generator(narrative: nil, raise: nil)
    generator = StubGenerator.new(narrative: narrative, raise: raise)
    GenerateStoryWrapupJob.generator_factory = -> { generator }
    generator
  end

  test "persists wrapup text and timestamp" do
    stub_generator(narrative: "# Story\n\nIt was epic.")

    freeze_time do
      GenerateStoryWrapupJob.perform_now(@story.id)

      @story.reload
      assert_equal "# Story\n\nIt was epic.", @story.wrapup
      assert_equal Time.current, @story.wrapup_generated_at
    end
  end

  test "overwrites a prior wrapup on re-run" do
    @story.update!(wrapup: "# Old", wrapup_generated_at: 1.day.ago)
    stub_generator(narrative: "# New narrative")

    GenerateStoryWrapupJob.perform_now(@story.id)

    @story.reload
    assert_equal "# New narrative", @story.wrapup
    assert_operator @story.wrapup_generated_at, :>, 1.hour.ago
  end

  test "no-ops when the story is missing" do
    stub_generator(narrative: "shouldn't be called")

    assert_nothing_raised do
      GenerateStoryWrapupJob.perform_now(-1)
    end
  end

  test "propagates WrapupFailed (no retry on deterministic errors)" do
    stub_generator(raise: StoryWrapupGenerator::WrapupFailed.new("empty"))

    assert_raises(StoryWrapupGenerator::WrapupFailed) do
      GenerateStoryWrapupJob.perform_now(@story.id)
    end
  end

  test "retries on LlmClient::Unreachable" do
    # retry_on is configured; just verify the error bubbles when we run
    # perform_now (which doesn't actually retry, but will raise).
    stub_generator(raise: LlmClient::Unreachable.new("down"))

    assert_raises(LlmClient::Unreachable) do
      GenerateStoryWrapupJob.perform_now(@story.id)
    end
  end

  class StubGenerator
    def initialize(narrative: nil, raise: nil)
      @narrative = narrative
      @raise = raise
    end

    def generate(_story)
      Kernel.raise(@raise) if @raise

      @narrative
    end
  end
end
