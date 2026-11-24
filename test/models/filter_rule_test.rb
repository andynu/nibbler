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

  # ===================
  # Metric rules
  # ===================

  test "word_count >= threshold is inclusive" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: ">=2500")

    assert rule.matches?(word_count: 2500)
    assert_not rule.matches?(word_count: 2499)
  end

  test "word_count > threshold is exclusive" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: ">2500")

    assert rule.matches?(word_count: 2501)
    assert_not rule.matches?(word_count: 2500)
  end

  test "link_density < threshold is exclusive" do
    rule = FilterRule.new(filter: @filter, filter_type: "link_density", reg_exp: "<3")

    assert rule.matches?(link_density: 2.9)
    assert_not rule.matches?(link_density: 3.0)
  end

  test "link_density <= threshold accepts a decimal" do
    rule = FilterRule.new(filter: @filter, filter_type: "link_density", reg_exp: "<=2.5")

    assert rule.matches?(link_density: 2.5)
    assert_not rule.matches?(link_density: 2.51)
  end

  test "range threshold is inclusive at both ends" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: "1000..4000")

    assert rule.matches?(word_count: 1000)
    assert rule.matches?(word_count: 4000)
    assert_not rule.matches?(word_count: 999)
    assert_not rule.matches?(word_count: 4001)
  end

  test "threshold tolerates surrounding whitespace" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: " >= 2500 ")

    assert rule.matches?(word_count: 3000)
  end

  test "NULL metric never matches" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: ">=2500")

    assert_not rule.matches?(word_count: nil)
    assert_not rule.matches?({})
  end

  test "NULL metric does not match an inverse rule either" do
    word_rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: ">=2500", inverse: true)
    density_rule = FilterRule.new(filter: @filter, filter_type: "link_density", reg_exp: "<3", inverse: true)

    assert_not word_rule.matches?(word_count: nil)
    assert_not density_rule.matches?(link_density: nil)
  end

  test "inverse metric rule negates a measured value" do
    rule = FilterRule.new(filter: @filter, filter_type: "link_density", reg_exp: "<3", inverse: true)

    assert rule.matches?(link_density: 5.0)
    assert_not rule.matches?(link_density: 1.0)
  end

  test "malformed threshold yields no match and no exception" do
    [ "abc", ">=", "5..", "..5", ">=abc", "1..2..3", "=5" ].each do |criterion|
      rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: criterion)

      assert_nothing_raised { rule.matches?(word_count: 5) }
      assert_not rule.matches?(word_count: 5), "expected #{criterion.inspect} not to match"
    end
  end

  test "malformed threshold yields no match on an inverse rule" do
    rule = FilterRule.new(filter: @filter, filter_type: "word_count", reg_exp: "abc", inverse: true)

    assert_not rule.matches?(word_count: 5)
  end

  test "metric types pass validation" do
    %w[word_count link_density].each do |type|
      rule = FilterRule.new(filter: @filter, filter_type: type, reg_exp: ">=1")
      assert rule.valid?, rule.errors.full_messages.to_sentence
    end
  end
end
