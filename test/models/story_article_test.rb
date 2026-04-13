require "test_helper"

class StoryArticleTest < ActiveSupport::TestCase
  setup do
    @article = story_articles(:first_article)
  end

  test "belongs to story" do
    assert_equal stories(:active_story), @article.story
  end

  test "requires url" do
    article = StoryArticle.new(story: stories(:active_story))
    assert_not article.valid?
    assert_includes article.errors[:url], "can't be blank"
  end

  test "url is unique per story" do
    dup = StoryArticle.new(story: @article.story, url: @article.url)
    assert_not dup.valid?
    assert_includes dup.errors[:url], "has already been taken"
  end

  test "same url allowed across different stories" do
    other = StoryArticle.new(story: stories(:sourced_story), url: @article.url, title: "Dup")
    assert other.valid?
  end
end
