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

  test "url is unique per story, enforced by the database index" do
    dup = StoryArticle.new(story: @article.story, url: @article.url)
    assert dup.valid?, "model must not pre-check uniqueness; the fetch job dedups on RecordNotUnique"
    assert_raises ActiveRecord::RecordNotUnique do
      dup.save!
    end
  end

  test "same url allowed across different stories" do
    other = StoryArticle.new(story: stories(:sourced_story), url: @article.url, title: "Dup")
    assert other.save
  end
end
