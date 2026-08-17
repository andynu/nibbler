require "test_helper"

class StoryTest < ActiveSupport::TestCase
  setup do
    @active = stories(:active_story)
    @concluded = stories(:concluded_story)
    @sourced = stories(:sourced_story)
  end

  test "belongs to user" do
    assert_equal users(:one), @active.user
  end

  test "belongs to optional source_entry" do
    assert_nil @active.source_entry
    assert_equal entries(:basic), @sourced.source_entry
  end

  test "has many story_articles" do
    assert_includes @active.story_articles, story_articles(:first_article)
    assert_equal 2, @active.story_articles.count
  end

  test "has many story_analyses" do
    assert_includes @active.story_analyses, story_analyses(:latest)
  end

  test "requires name" do
    story = Story.new(user: users(:one), status: "active")
    assert_not story.valid?
    assert_includes story.errors[:name], "can't be blank"
  end

  test "requires user" do
    story = Story.new(name: "Test", status: "active")
    assert_not story.valid?
  end

  test "validates status inclusion" do
    story = Story.new(user: users(:one), name: "Test", status: "bogus")
    assert_not story.valid?
    assert_includes story.errors[:status], "is not included in the list"
  end

  test "active scope returns only active stories" do
    assert_includes Story.active, @active
    assert_not_includes Story.active, @concluded
  end

  test "concluded scope returns only concluded stories" do
    assert_includes Story.concluded, @concluded
    assert_not_includes Story.concluded, @active
  end

  test "#active? and #concluded?" do
    assert @active.active?
    assert_not @active.concluded?
    assert @concluded.concluded?
    assert_not @concluded.active?
  end

  test "#conclude! flips status and stamps concluded_at" do
    freeze_time do
      @active.conclude!
      assert @active.concluded?
      assert_equal Time.current, @active.concluded_at
    end
  end

  test "queries field persists as array" do
    assert_equal [ "SEC crypto regulation", "crypto enforcement 2026" ], @active.queries
  end
end
