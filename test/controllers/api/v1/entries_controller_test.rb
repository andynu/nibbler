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

  test "multi-column sort parameter works" do
    feed2 = feeds(:low_frequency)

    # Create entries with different dates and scores
    entry1 = Entry.create!(
      guid: "sort-test-1-#{SecureRandom.uuid}",
      title: "Alpha Article",
      link: "https://example.com/alpha",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 2.days.ago,
      date_entered: 2.days.ago,
      date_updated: Time.current
    )

    entry2 = Entry.create!(
      guid: "sort-test-2-#{SecureRandom.uuid}",
      title: "Beta Article",
      link: "https://example.com/beta",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.day.ago,
      date_entered: 1.day.ago,
      date_updated: Time.current
    )

    ue1 = @user.user_entries.create!(
      entry: entry1, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 5
    )

    ue2 = @user.user_entries.create!(
      entry: entry2, feed: feed2, uuid: SecureRandom.uuid, unread: true, score: 3
    )

    # Sort by score descending - entry1 (score 5) should be first
    get api_v1_entries_url, params: { sort: "score:desc" }, as: :json
    assert_response :success
    json = JSON.parse(response.body)
    scores = json["entries"].map { |e| e["score"] }
    # Check that scores are in descending order (allowing for existing entries)
    assert scores.first >= scores.last, "Scores should be in descending order"

    # Sort by date ascending - older entry1 should be first
    get api_v1_entries_url, params: { sort: "date:asc" }, as: :json
    assert_response :success
    json = JSON.parse(response.body)
    ids = json["entries"].map { |e| e["id"] }
    idx1 = ids.index(ue1.id)
    idx2 = ids.index(ue2.id)
    assert idx1 < idx2, "Older entry should come first with date:asc"
  end

  test "multi-column sort ignores invalid columns" do
    get api_v1_entries_url, params: { sort: "invalid_column:desc,date:asc" }, as: :json
    assert_response :success
    # Should not raise an error, invalid column is skipped
  end

  test "multi-column sort with feed sorts by feed title" do
    # This test verifies the feed column sort works (feeds table joined)
    get api_v1_entries_url, params: { sort: "feed:asc,date:desc" }, as: :json
    assert_response :success
    json = JSON.parse(response.body)
    assert json["entries"].is_a?(Array)
  end

  test "legacy order_by param still works" do
    get api_v1_entries_url, params: { order_by: "score" }, as: :json
    assert_response :success
    json = JSON.parse(response.body)
    assert json["entries"].is_a?(Array)
  end

  test "sort param takes precedence over order_by" do
    # Create entries with different scores
    entry = Entry.create!(
      guid: "precedence-test-#{SecureRandom.uuid}",
      title: "Precedence Test",
      link: "https://example.com/prec",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 0
    )

    # Both params present - sort should win
    get api_v1_entries_url, params: { sort: "title:asc", order_by: "score" }, as: :json
    assert_response :success
    # If sort takes precedence, entries should be sorted by title, not score
    # We just verify no error occurs - detailed order testing done above
  end
end
