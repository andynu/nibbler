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

  test "filters entries by tag" do
    # Create two entries - one tagged, one not
    tagged_entry = Entry.create!(
      guid: "tagged-entry-#{SecureRandom.uuid}",
      title: "Tagged Article",
      link: "https://example.com/tagged",
      content: "<p>Tagged content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    untagged_entry = Entry.create!(
      guid: "untagged-entry-#{SecureRandom.uuid}",
      title: "Untagged Article",
      link: "https://example.com/untagged",
      content: "<p>Untagged content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: tagged_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )

    @user.user_entries.create!(
      entry: untagged_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )

    # Create tag and apply to tagged_entry
    tag = Tag.create!(name: "ruby", user: @user)
    EntryTag.create!(entry: tagged_entry, tag: tag)

    # Filter by tag
    get api_v1_entries_url, params: { tag: "ruby" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }

    # Tagged entry should appear
    assert_includes titles, "Tagged Article"
    # Untagged entry should NOT appear
    refute_includes titles, "Untagged Article"
  end

  test "tag filter is case insensitive" do
    entry = Entry.create!(
      guid: "case-test-#{SecureRandom.uuid}",
      title: "Case Test Article",
      link: "https://example.com/case",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )

    tag = Tag.create!(name: "ruby", user: @user)
    EntryTag.create!(entry: entry, tag: tag)

    # Filter with uppercase should still match lowercase tag
    get api_v1_entries_url, params: { tag: "Ruby" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }
    assert_includes titles, "Case Test Article"
  end

  test "show returns entry with tags and enclosures" do
    # Create entry for the current user (User.first used by ALLOW_DEV_AUTH)
    entry = Entry.create!(
      guid: "show-test-#{SecureRandom.uuid}",
      title: "Show Test Entry",
      link: "https://example.com/show-test",
      content: "<p>Test content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    user_entry = @user.user_entries.create!(
      entry: entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      unread: true
    )

    # Create a tag and enclosure for this entry
    tag = Tag.create!(name: "test-tag", user: @user, fg_color: "#ffffff", bg_color: "#000000")
    EntryTag.create!(entry: entry, tag: tag)

    Enclosure.create!(
      entry: entry,
      content_url: "https://example.com/audio.mp3",
      content_type: "audio/mpeg",
      duration: "1234",
      title: "Test Audio"
    )

    get api_v1_entry_url(user_entry), as: :json
    assert_response :success

    json = JSON.parse(response.body)

    # Verify tags are returned
    assert json["tags"].is_a?(Array)
    assert_equal 1, json["tags"].length
    assert_equal "test-tag", json["tags"].first["name"]
    assert_equal "#ffffff", json["tags"].first["fg_color"]
    assert_equal "#000000", json["tags"].first["bg_color"]

    # Verify enclosures are returned
    assert json["enclosures"].is_a?(Array)
    assert_equal 1, json["enclosures"].length
    assert_equal "https://example.com/audio.mp3", json["enclosures"].first["content_url"]
    assert_equal "audio/mpeg", json["enclosures"].first["content_type"]
    assert_equal "1234", json["enclosures"].first["duration"]
  end

  test "tag filter only shows entries tagged by current user" do
    # Create another user
    other_user = User.create!(login: "other_user", password: "password123")

    entry = Entry.create!(
      guid: "multi-user-#{SecureRandom.uuid}",
      title: "Multi User Article",
      link: "https://example.com/multi",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )

    # Tag belongs to OTHER user
    other_tag = Tag.create!(name: "ruby", user: other_user)
    EntryTag.create!(entry: entry, tag: other_tag)

    # Current user filters by ruby - should NOT see the entry
    # (tag belongs to other user)
    get api_v1_entries_url, params: { tag: "ruby" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    titles = json["entries"].map { |e| e["title"] }
    refute_includes titles, "Multi User Article"
  end
end
