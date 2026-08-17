require "test_helper"

class StoryAnalysisTest < ActiveSupport::TestCase
  setup do
    @latest = story_analyses(:latest)
    @previous = story_analyses(:previous)
  end

  test "belongs to story" do
    assert_equal stories(:active_story), @latest.story
  end

  test "article_ids persists as array" do
    assert_equal [ 1, 2 ], @latest.article_ids
    assert_equal [], @previous.article_ids
  end

  test "recent scope orders by created_at desc" do
    ordered = stories(:active_story).story_analyses.recent.to_a
    assert_equal @latest, ordered.first
    assert_equal @previous, ordered.last
  end
end
