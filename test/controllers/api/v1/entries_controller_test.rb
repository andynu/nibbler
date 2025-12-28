require "test_helper"

class Api::V1::EntriesControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = User.first
    @feed = feeds(:high_frequency)
  end

  test "fresh view filters by publication date not import date" do
    # Create an entry that was published a month ago but imported today
    old_entry = Entry.create!(
      guid: "old-entry-#{SecureRandom.uuid}",
      title: "Old Article Published Last Month",
      link: "https://example.com/old",
      content: "<p>Old content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 2.months.ago, # Published 2 months ago
      date_entered: 1.minute.ago, # But imported just now
      date_updated: Time.current
    )

    # Create an entry that was published today
    recent_entry = Entry.create!(
      guid: "recent-entry-#{SecureRandom.uuid}",
      title: "Recent Article Published Today",
      link: "https://example.com/recent",
      content: "<p>Recent content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago, # Published recently
      date_entered: 1.minute.ago, # Also imported recently
      date_updated: Time.current
    )

    # Create UserEntry records for both
    @user.user_entries.create!(
      entry: old_entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )

    @user.user_entries.create!(
      entry: recent_entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )

    # Request fresh view with week filter
    get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "week" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }

    # The recent entry should appear (published within last week)
    assert_includes titles, "Recent Article Published Today"

    # The old entry should NOT appear (published 2 months ago, even though imported recently)
    refute_includes titles, "Old Article Published Last Month"
  end

  test "fresh view with month filter includes articles from last 30 days" do
    # Create an entry published 2 weeks ago (within month)
    two_weeks_entry = Entry.create!(
      guid: "two-weeks-#{SecureRandom.uuid}",
      title: "Article From Two Weeks Ago",
      link: "https://example.com/twoweeks",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 2.weeks.ago,
      date_entered: 1.minute.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: two_weeks_entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )

    # With week filter, it should NOT appear
    get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "week" }, as: :json
    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }
    refute_includes titles, "Article From Two Weeks Ago"

    # With month filter, it SHOULD appear
    get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "month" }, as: :json
    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }
    assert_includes titles, "Article From Two Weeks Ago"
  end

  test "fresh view with all filter shows all articles" do
    # Create an old entry
    old_entry = Entry.create!(
      guid: "very-old-#{SecureRandom.uuid}",
      title: "Very Old Article",
      link: "https://example.com/veryold",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 6.months.ago,
      date_entered: 1.minute.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: old_entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )

    # With "all" filter, even old entries should appear
    get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "all" }, as: :json
    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }
    assert_includes titles, "Very Old Article"
  end
end
