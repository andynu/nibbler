require "test_helper"

class FilterRuleTest < ActiveSupport::TestCase
  setup do
    @filter = filters(:basic_filter)
  end

  test "matches title filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "title",
      reg_exp: "test"
    )

    assert rule.matches?(title: "This is a test article")
    assert_not rule.matches?(title: "No match here")
  end

  test "matches content filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "content",
      reg_exp: "important"
    )

    assert rule.matches?(content: "This is important news")
    assert_not rule.matches?(content: "Nothing special")
  end

  test "matches both filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "both",
      reg_exp: "ruby"
    )

    assert rule.matches?(title: "Ruby programming", content: "No match")
    assert rule.matches?(title: "No match", content: "Learn ruby today")
    assert_not rule.matches?(title: "Python", content: "JavaScript")
  end

  test "matches link filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "link",
      reg_exp: "example\\.com"
    )

    assert rule.matches?(link: "https://example.com/article")
    assert_not rule.matches?(link: "https://other.org/article")
  end

  test "matches author filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "author",
      reg_exp: "john"
    )

    assert rule.matches?(author: "John Smith")
    assert_not rule.matches?(author: "Jane Doe")
  end

  test "matches tag filter" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "tag",
      reg_exp: "tech"
    )

    assert rule.matches?(tags: %w[tech news])
    assert_not rule.matches?(tags: %w[sports entertainment])
    assert_not rule.matches?(tags: nil)
  end

  test "inverse negates result" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "title",
      reg_exp: "test",
      inverse: true
    )

    assert_not rule.matches?(title: "This is a test article")
    assert rule.matches?(title: "No match here")
  end

  # Date filter tests
  test "date filter matches articles within last N days" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "<7d"
    )

    assert rule.matches?(published: 3.days.ago)
    assert rule.matches?(published: 6.days.ago)
    assert_not rule.matches?(published: 10.days.ago)
  end

  test "date filter matches articles older than N days" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: ">7d"
    )

    assert_not rule.matches?(published: 3.days.ago)
    assert rule.matches?(published: 10.days.ago)
    assert rule.matches?(published: 30.days.ago)
  end

  test "date filter matches articles after specific date" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: ">2025-01-01"
    )

    assert rule.matches?(published: Time.new(2025, 6, 15))
    assert_not rule.matches?(published: Time.new(2024, 12, 15))
    assert_not rule.matches?(published: Time.new(2025, 1, 1))
  end

  test "date filter matches articles before specific date" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "<2025-01-01"
    )

    assert_not rule.matches?(published: Time.new(2025, 6, 15))
    assert rule.matches?(published: Time.new(2024, 12, 15))
    assert_not rule.matches?(published: Time.new(2025, 1, 1))
  end

  test "date filter matches articles within date range" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "2025-01-01..2025-06-30"
    )

    assert rule.matches?(published: Time.new(2025, 3, 15))
    assert rule.matches?(published: Time.new(2025, 1, 1))
    assert rule.matches?(published: Time.new(2025, 6, 30))
    assert_not rule.matches?(published: Time.new(2024, 12, 15))
    assert_not rule.matches?(published: Time.new(2025, 7, 1))
  end

  test "date filter falls back to updated if published missing" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "<7d"
    )

    assert rule.matches?(updated: 3.days.ago)
    assert_not rule.matches?(updated: 10.days.ago)
  end

  test "date filter returns false for missing date" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "<7d"
    )

    assert_not rule.matches?(title: "Article without date")
  end

  test "date filter returns false for invalid criterion" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "invalid"
    )

    assert_not rule.matches?(published: 3.days.ago)
  end

  test "date filter with inverse" do
    rule = FilterRule.new(
      filter: @filter,
      filter_type: "date",
      reg_exp: "<7d",
      inverse: true
    )

    # With inverse, matches articles NOT within last 7 days
    assert_not rule.matches?(published: 3.days.ago)
    assert rule.matches?(published: 10.days.ago)
  end
end
