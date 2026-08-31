require "test_helper"

class Api::V1::EntriesControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = sign_in(User.first)
    @feed = feeds(:high_frequency)
  end

  def create_entry(title, updated:, date_entered: nil)
    Entry.create!(
      guid: "entry-#{SecureRandom.uuid}",
      title: title,
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: updated,
      date_entered: date_entered || updated,
      date_updated: Time.current
    )
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

  test "fresh view excludes articles that have already been read" do
    read_entry = create_entry("Read Fresh Article", updated: 1.hour.ago)
    unread_entry = create_entry("Unread Fresh Article", updated: 1.hour.ago)

    @user.user_entries.create!(entry: read_entry, feed: @feed, uuid: SecureRandom.uuid, unread: false)
    @user.user_entries.create!(entry: unread_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    get api_v1_entries_url, params: { view: "fresh" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["entries"].map { |e| e["title"] }
    assert_includes titles, "Unread Fresh Article"
    refute_includes titles, "Read Fresh Article"
  end

  test "headlines fresh view excludes articles that have already been read" do
    read_entry = create_entry("Read Fresh Headline", updated: 1.hour.ago)
    unread_entry = create_entry("Unread Fresh Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: read_entry, feed: @feed, uuid: SecureRandom.uuid, unread: false)
    @user.user_entries.create!(entry: unread_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    get headlines_api_v1_entries_url, params: { view: "fresh" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["headlines"].map { |h| h["title"] }
    assert_includes titles, "Unread Fresh Headline"
    refute_includes titles, "Read Fresh Headline"
  end

  test "headlines fresh view filters by publication date and honours fresh_max_age" do
    # Published two weeks ago but imported a minute ago
    stale_entry = create_entry("Stale Headline", updated: 2.weeks.ago, date_entered: 1.minute.ago)
    @user.user_entries.create!(entry: stale_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    # Default window is the 24 hour preference, so recent import is not enough
    get headlines_api_v1_entries_url, params: { view: "fresh" }, as: :json
    assert_response :success
    titles = JSON.parse(response.body)["headlines"].map { |h| h["title"] }
    refute_includes titles, "Stale Headline"

    get headlines_api_v1_entries_url, params: { view: "fresh", fresh_max_age: "month" }, as: :json
    assert_response :success
    titles = JSON.parse(response.body)["headlines"].map { |h| h["title"] }
    assert_includes titles, "Stale Headline"
  end

  test "fresh view honours the sort selection under a per-feed cap" do
    low_score = create_entry("Capped Low Score", updated: 1.hour.ago, date_entered: 1.minute.ago)
    high_score = create_entry("Capped High Score", updated: 1.hour.ago, date_entered: 2.minutes.ago)

    @user.user_entries.create!(entry: low_score, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 1)
    @user.user_entries.create!(entry: high_score, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 9)

    get api_v1_entries_url, params: { view: "fresh", fresh_per_feed: 5, sort: "score:desc" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["entries"].map { |e| e["title"] }
    assert_operator titles.index("Capped High Score"), :<, titles.index("Capped Low Score"),
      "per-feed cap must not discard the requested sort"
  end

  test "fresh view and headlines order identically under a per-feed cap" do
    newest = create_entry("Cap Agreement Newest", updated: 1.hour.ago, date_entered: 1.minute.ago)
    oldest = create_entry("Cap Agreement Oldest", updated: 1.hour.ago, date_entered: 2.minutes.ago)

    @user.user_entries.create!(entry: newest, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 1)
    @user.user_entries.create!(entry: oldest, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: 9)

    params = { view: "fresh", fresh_per_feed: 5, sort: "score:desc" }

    get api_v1_entries_url, params: params, as: :json
    assert_response :success
    entry_ids = JSON.parse(response.body)["entries"].map { |e| e["id"] }

    get headlines_api_v1_entries_url, params: params, as: :json
    assert_response :success
    headline_ids = JSON.parse(response.body)["headlines"].map { |h| h["id"] }

    assert_equal headline_ids, entry_ids, "index and headlines must agree under a per-feed cap"
  end

  test "fresh view per-feed cap keeps the newest articles of each feed" do
    other_feed = feeds(:low_frequency)

    3.times do |i|
      entry = create_entry("Capped Feed A #{i}", updated: 1.hour.ago, date_entered: (i + 1).minutes.ago)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end

    kept = create_entry("Capped Feed B Newest", updated: 1.minute.ago)
    dropped = create_entry("Capped Feed B Oldest", updated: 30.minutes.ago)
    @user.user_entries.create!(entry: kept, feed: other_feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: dropped, feed: other_feed, uuid: SecureRandom.uuid, unread: true)

    get api_v1_entries_url, params: { view: "fresh", fresh_per_feed: 1 }, as: :json
    assert_response :success

    entries = JSON.parse(response.body)["entries"]
    titles = entries.map { |e| e["title"] }
    assert_includes titles, "Capped Feed B Newest"
    refute_includes titles, "Capped Feed B Oldest"
    assert_equal 1, entries.count { |e| e["feed_id"] == @feed.id }
    assert_equal 1, entries.count { |e| e["feed_id"] == other_feed.id }
  end

  test "fresh view per-feed cap ranks by publication date not import date" do
    feed = feeds(:low_frequency)

    # Fresh membership is decided by publication date, so the cap has to rank on
    # the same clock: a backlog article imported a minute ago must not displace
    # an article published an hour ago that has been sitting in the database.
    published_recently = create_entry("Published Recently", updated: 1.hour.ago, date_entered: 3.days.ago)
    imported_recently = create_entry("Imported Recently", updated: 3.days.ago, date_entered: 1.minute.ago)
    @user.user_entries.create!(entry: published_recently, feed: feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: imported_recently, feed: feed, uuid: SecureRandom.uuid, unread: true)

    get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "week", fresh_per_feed: 1 }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["entries"]
      .select { |e| e["feed_id"] == feed.id }
      .map { |e| e["title"] }

    assert_equal [ "Published Recently" ], titles,
      "the cap must keep the most recently published article, not the most recently imported"
  end

  test "fresh view per-feed cap breaks publication date ties deterministically" do
    feed = feeds(:low_frequency)
    published_at = 1.hour.ago

    # Feeds that stamp every article with the same publication date still need a
    # stable answer, so import date and then id decide the order.
    older_import = create_entry("Tied Older Import", updated: published_at, date_entered: 2.days.ago)
    newer_import = create_entry("Tied Newer Import", updated: published_at, date_entered: 1.minute.ago)
    @user.user_entries.create!(entry: older_import, feed: feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: newer_import, feed: feed, uuid: SecureRandom.uuid, unread: true)

    2.times do
      get api_v1_entries_url, params: { view: "fresh", fresh_max_age: "week", fresh_per_feed: 1 }, as: :json
      assert_response :success

      titles = JSON.parse(response.body)["entries"]
        .select { |e| e["feed_id"] == feed.id }
        .map { |e| e["title"] }

      assert_equal [ "Tied Newer Import" ], titles,
        "tied publication dates must fall back to import date"
    end
  end

  test "fresh view per-feed cap ranks tagged articles, not all fresh articles" do
    tag = Tag.create!(name: "ruby", user: @user)

    # Five untagged fresh articles rank ahead of the tagged one by publication
    # date, so a cap applied before the tag filter would leave nothing to return.
    5.times do |i|
      entry = create_entry("Untagged Fresh #{i}", updated: (i + 1).minutes.ago)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end

    buried = create_entry("Tagged But Buried", updated: 30.minutes.ago)
    EntryTag.create!(entry: buried, tag: tag)
    @user.user_entries.create!(entry: buried, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    get api_v1_entries_url, params: { view: "fresh", fresh_per_feed: 5, tag: "ruby" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["entries"].map { |e| e["title"] }
    assert_equal [ "Tagged But Buried" ], titles,
      "per-feed cap must be applied after the tag filter, not before it"
  end

  test "fresh view per-feed cap counts matching articles when a tag filter is applied" do
    tag = Tag.create!(name: "ruby", user: @user)

    3.times do |i|
      entry = create_entry("Tagged Fresh #{i}", updated: (i + 1).minutes.ago)
      EntryTag.create!(entry: entry, tag: tag)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end

    # Newer untagged articles would consume the whole cap if it ran first
    2.times do |i|
      entry = create_entry("Untagged Newer #{i}", updated: (i + 1).seconds.ago)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end

    get api_v1_entries_url, params: { view: "fresh", fresh_per_feed: 2, tag: "ruby" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["entries"].map { |e| e["title"] }
    assert_equal [ "Tagged Fresh 0", "Tagged Fresh 1" ], titles,
      "the cap keeps the newest N matching articles of the feed"
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

  # The sort grammar itself: how "column:direction,column:direction" is split,
  # downcased, whitelisted and defaulted, as opposed to which columns this
  # endpoint offers. Characterisation tests -- they describe what the controller
  # already does, so they pass before and after the parser moves out of it, and
  # /search carries the matching set for its own vocabulary.
  #
  # Every pair below is seeded so title order and import-date order disagree.
  # That is what keeps an assertion from being satisfied by the
  # entries.date_entered DESC default the endpoint falls back to.
  def seed_grammar_pair(aardvark:, zebra:)
    { "Aardvark Grammar" => aardvark, "Zebra Grammar" => zebra }.each do |title, entered|
      entry = create_entry(title, updated: 1.hour.ago, date_entered: entered)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end
  end

  def grammar_titles(params)
    get api_v1_entries_url, params: params, as: :json
    assert_response :success
    JSON.parse(response.body)["entries"].map { |e| e["title"] }.grep(/Grammar/)
  end

  test "a sort column and direction are matched case-insensitively" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Aardvark Grammar", "Zebra Grammar" ], grammar_titles(sort: "DATE:ASC"),
      "an uppercase clause has to parse; unparsed, the default puts the newer Zebra first"
  end

  test "a sort direction the grammar does not know falls back to descending" do
    seed_grammar_pair(aardvark: 1.hour.ago, zebra: 1.week.ago)

    assert_equal [ "Zebra Grammar", "Aardvark Grammar" ], grammar_titles(sort: "title:sideways")
  end

  test "a sort clause with no direction at all sorts descending" do
    seed_grammar_pair(aardvark: 1.hour.ago, zebra: 1.week.ago)

    assert_equal [ "Zebra Grammar", "Aardvark Grammar" ], grammar_titles(sort: "title")
  end

  test "a blank sort param falls back to import date descending" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Zebra Grammar", "Aardvark Grammar" ], grammar_titles(sort: "")
  end

  # "relevance" is search's column, not this endpoint's, and the two maps are
  # meant to stay different. A sort carried over from a search has to land on
  # the entry list's own default rather than error.
  test "a sort naming only columns the entry list does not offer falls back to import date descending" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Zebra Grammar", "Aardvark Grammar" ], grammar_titles(sort: "nonsense:asc,relevance:desc")
  end

  test "an unrecognised sort column is dropped and the clauses beside it still apply" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Aardvark Grammar", "Zebra Grammar" ], grammar_titles(sort: "nonsense:desc,title:asc")
  end

  test "an empty sort clause between two commas is dropped rather than raising" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Aardvark Grammar", "Zebra Grammar" ], grammar_titles(sort: "title:asc,,date:desc")
  end

  test "whitespace around each sort clause is ignored" do
    seed_grammar_pair(aardvark: 1.week.ago, zebra: 1.hour.ago)

    assert_equal [ "Aardvark Grammar", "Zebra Grammar" ], grammar_titles(sort: " title:asc , date:desc ")
  end

  # Clause order survives parsing: score decides first and title only breaks the
  # tie score leaves, which is the opposite of what title alone would produce.
  test "a later sort clause breaks the tie an earlier one leaves" do
    { "Zebra Grammar" => 9, "Aardvark Grammar" => 9, "Aabbey Grammar" => 8 }.each do |title, score|
      entry = create_entry(title, updated: 1.hour.ago, date_entered: 1.hour.ago)
      @user.user_entries.create!(
        entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true, score: score
      )
    end

    assert_equal [ "Aardvark Grammar", "Zebra Grammar", "Aabbey Grammar" ],
      grammar_titles(sort: "score:desc,title:asc")
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
    # Create entry for the signed in user
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

  # strip_tags puts nothing in a removed tag's place, so the preview -- which
  # is the opening of the body, where block boundaries are densest -- showed
  # the reader "failed.Members" and a literal "&amp;".
  test "content preview separates adjacent blocks and decodes entities" do
    entry = Entry.create!(
      guid: "preview-#{SecureRandom.uuid}",
      title: "Town Meeting",
      link: "https://example.com/preview",
      content: "<p>The vote failed.</p><p>Members left early.</p><p>AT&amp;T&nbsp;declined.</p>",
      content_hash: SecureRandom.hex(8),
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    )
    user_entry = @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )

    get api_v1_entry_url(user_entry), as: :json
    assert_response :success

    assert_equal "The vote failed. Members left early. AT&T declined.",
      JSON.parse(response.body)["content_preview"]
  end

  # detect_tags_in_content matches a tag name as a substring of the same text.
  # A welded body hid any multi-word tag straddling a block boundary, and an
  # encoded entity hid any tag name containing the character it encoded.
  test "detected tags survive block boundaries and encoded entities" do
    entry = Entry.create!(
      guid: "detect-#{SecureRandom.uuid}",
      title: "Wildlife",
      link: "https://example.com/detect",
      content: "<h2>Quokka</h2><p>Census results</p><p>AT&amp;T sponsored it.</p>",
      content_hash: SecureRandom.hex(8),
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    )
    user_entry = @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )
    Tag.create!(name: "Quokka Census", user: @user, fg_color: "#ffffff", bg_color: "#000000")
    Tag.create!(name: "AT&T", user: @user, fg_color: "#ffffff", bg_color: "#000000")

    get api_v1_entry_url(user_entry), as: :json
    assert_response :success

    detected = JSON.parse(response.body)["detected_tags"].map { |t| t["name"] }
    assert_includes detected, "Quokka Census"
    assert_includes detected, "AT&T"
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

  test "headlines filters by tag like index does" do
    tag = Tag.create!(name: "ruby", user: @user)

    tagged = create_entry("Tagged Headline", updated: 1.hour.ago)
    untagged = create_entry("Untagged Headline", updated: 1.hour.ago)
    EntryTag.create!(entry: tagged, tag: tag)

    @user.user_entries.create!(entry: tagged, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: untagged, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    get headlines_api_v1_entries_url, params: { tag: "Ruby" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["headlines"].map { |h| h["title"] }
    assert_includes titles, "Tagged Headline"
    refute_includes titles, "Untagged Headline"
  end

  test "headlines tag filter only shows entries tagged by current user" do
    other_user = User.create!(login: "other_headline_user", password: "password123")

    entry = create_entry("Other User Tagged Headline", updated: 1.hour.ago)
    @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    EntryTag.create!(entry: entry, tag: Tag.create!(name: "ruby", user: other_user))

    get headlines_api_v1_entries_url, params: { tag: "ruby" }, as: :json
    assert_response :success

    titles = JSON.parse(response.body)["headlines"].map { |h| h["title"] }
    refute_includes titles, "Other User Tagged Headline"
  end

  test "index and headlines agree when a tag filter meets a per-feed cap" do
    tag = Tag.create!(name: "ruby", user: @user)

    # Untagged articles rank ahead by import date, so a cap applied before the
    # tag filter would consume the whole allowance and return nothing tagged.
    5.times do |i|
      entry = create_entry("Untagged Ahead #{i}", updated: 1.hour.ago, date_entered: (i + 1).seconds.ago)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    end

    buried = create_entry("Tagged But Buried Headline", updated: 1.hour.ago, date_entered: 30.minutes.ago)
    EntryTag.create!(entry: buried, tag: tag)
    @user.user_entries.create!(entry: buried, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    params = { view: "fresh", fresh_per_feed: 5, tag: "ruby" }

    get api_v1_entries_url, params: params, as: :json
    assert_response :success
    entries = JSON.parse(response.body)["entries"]

    get headlines_api_v1_entries_url, params: params, as: :json
    assert_response :success
    headlines = JSON.parse(response.body)["headlines"]

    assert_equal [ "Tagged But Buried Headline" ], headlines.map { |h| h["title"] },
      "headlines must apply the tag filter before the per-feed cap"
    assert_equal entries.map { |e| e["id"] }, headlines.map { |h| h["id"] },
      "index and headlines must agree under a tag filter"
  end

  # The scoping params #headlines reads had coverage only for tag and the fresh
  # view. The tests from here to #create_audio_user_entry pin the rest of the
  # vocabulary - unread, starred, published, feed_id, category_id and the three
  # non-fresh virtual views - so the endpoint's filtering is described by tests
  # independently of which code applies it.
  def headline_titles(params)
    get headlines_api_v1_entries_url, params: params, as: :json
    assert_response :success
    JSON.parse(response.body)["headlines"].map { |h| h["title"] }
  end

  test "headlines unread param selects unread when true and read when false" do
    read_entry = create_entry("Read State Headline", updated: 1.hour.ago)
    unread_entry = create_entry("Unread State Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: read_entry, feed: @feed, uuid: SecureRandom.uuid, unread: false)
    @user.user_entries.create!(entry: unread_entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(unread: "true")
    assert_includes titles, "Unread State Headline"
    refute_includes titles, "Read State Headline"

    titles = headline_titles(unread: "false")
    assert_includes titles, "Read State Headline"
    refute_includes titles, "Unread State Headline"
  end

  test "headlines starred param keeps only marked articles" do
    starred = create_entry("Starred Headline Row", updated: 1.hour.ago)
    plain = create_entry("Unstarred Headline Row", updated: 1.hour.ago)

    @user.user_entries.create!(entry: starred, feed: @feed, uuid: SecureRandom.uuid, unread: true, marked: true)
    @user.user_entries.create!(entry: plain, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(starred: "true")
    assert_includes titles, "Starred Headline Row"
    refute_includes titles, "Unstarred Headline Row"
  end

  test "headlines published param keeps only published articles" do
    published = create_entry("Published Headline Row", updated: 1.hour.ago)
    plain = create_entry("Unpublished Headline Row", updated: 1.hour.ago)

    @user.user_entries.create!(entry: published, feed: @feed, uuid: SecureRandom.uuid, unread: true, published: true)
    @user.user_entries.create!(entry: plain, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(published: "true")
    assert_includes titles, "Published Headline Row"
    refute_includes titles, "Unpublished Headline Row"
  end

  test "headlines feed_id param keeps only that feed's articles" do
    other_feed = feeds(:low_frequency)

    mine = create_entry("Wanted Feed Headline", updated: 1.hour.ago)
    theirs = create_entry("Other Feed Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: mine, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: theirs, feed: other_feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(feed_id: @feed.id)
    assert_includes titles, "Wanted Feed Headline"
    refute_includes titles, "Other Feed Headline"
  end

  test "headlines category_id param covers the category's whole subtree" do
    parent = Category.create!(title: "Parent Category", user: @user)
    child = Category.create!(title: "Child Category", user: @user, parent: parent)
    outside = Category.create!(title: "Outside Category", user: @user)

    @feed.update!(category: child)
    other_feed = feeds(:low_frequency)
    other_feed.update!(category: outside)

    nested = create_entry("Nested Category Headline", updated: 1.hour.ago)
    unrelated = create_entry("Unrelated Category Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: nested, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: unrelated, feed: other_feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(category_id: parent.id)
    assert_includes titles, "Nested Category Headline",
      "a parent category must include the feeds filed under its children"
    refute_includes titles, "Unrelated Category Headline"
  end

  test "headlines category_id from another user filters nothing" do
    other_user = User.create!(login: "other_headline_category_user", password: "password123")
    foreign = Category.create!(title: "Foreign Category", user: other_user)

    entry = create_entry("Foreign Category Headline", updated: 1.hour.ago)
    @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    titles = headline_titles(category_id: foreign.id)
    assert_includes titles, "Foreign Category Headline",
      "an unreachable category id must filter nothing rather than leak or empty the list"
  end

  test "headlines starred published and archived views match their filters" do
    starred = create_entry("Starred View Headline", updated: 1.hour.ago)
    published = create_entry("Published View Headline", updated: 1.hour.ago)
    archived = create_entry("Archived View Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: starred, feed: @feed, uuid: SecureRandom.uuid, unread: true, marked: true)
    @user.user_entries.create!(entry: published, feed: @feed, uuid: SecureRandom.uuid, unread: true, published: true)
    @user.user_entries.create!(entry: archived, feed: @feed, uuid: SecureRandom.uuid, unread: false)

    titles = headline_titles(view: "starred")
    assert_equal [ "Starred View Headline" ], titles

    titles = headline_titles(view: "published")
    assert_equal [ "Published View Headline" ], titles

    titles = headline_titles(view: "archived")
    assert_equal [ "Archived View Headline" ], titles
  end

  test "headlines applies unread starred and category filters together" do
    parent = Category.create!(title: "Combined Parent", user: @user)
    @feed.update!(category: parent)
    feeds(:low_frequency).update!(category: nil)

    wanted = create_entry("Combined Match Headline", updated: 1.hour.ago)
    wrong_state = create_entry("Combined Read Headline", updated: 1.hour.ago)
    wrong_flag = create_entry("Combined Unstarred Headline", updated: 1.hour.ago)
    wrong_feed = create_entry("Combined Other Category Headline", updated: 1.hour.ago)

    @user.user_entries.create!(entry: wanted, feed: @feed, uuid: SecureRandom.uuid, unread: true, marked: true)
    @user.user_entries.create!(entry: wrong_state, feed: @feed, uuid: SecureRandom.uuid, unread: false, marked: true)
    @user.user_entries.create!(entry: wrong_flag, feed: @feed, uuid: SecureRandom.uuid, unread: true)
    @user.user_entries.create!(entry: wrong_feed, feed: feeds(:low_frequency), uuid: SecureRandom.uuid, unread: true, marked: true)

    titles = headline_titles(unread: "true", starred: "true", category_id: parent.id)
    assert_equal [ "Combined Match Headline" ], titles
  end

  test "headlines pagination total counts the filtered rows not the whole table" do
    3.times do |i|
      entry = create_entry("Paged Headline #{i}", updated: 1.hour.ago, date_entered: (i + 1).minutes.ago)
      @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true, marked: true)
    end
    ignored = create_entry("Unpaged Headline", updated: 1.hour.ago)
    @user.user_entries.create!(entry: ignored, feed: @feed, uuid: SecureRandom.uuid, unread: true)

    get headlines_api_v1_entries_url, params: { starred: "true", per_page: 2 }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal 3, json["pagination"]["total"]
    assert_equal 2, json["pagination"]["total_pages"]
    assert_equal 2, json["headlines"].length
  end

  # The audio endpoint resolves entries through current_user, so tests need an
  # entry owned by the user setup signed in as.
  def create_audio_user_entry
    entry = Entry.create!(
      guid: "audio-entry-#{SecureRandom.uuid}",
      title: "Audio Article",
      link: "https://example.com/audio-article",
      content: "<p>Hello World</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )
  end

  test "audio reports unavailable and enqueues nothing without a TTS toolchain" do
    user_entry = create_audio_user_entry

    TtsGenerator.stub(:available?, false) do
      assert_no_enqueued_jobs only: GenerateArticleAudioJob do
        get audio_api_v1_entry_url(user_entry), as: :json
      end
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "unavailable", json["status"]
    assert_equal TtsGenerator::UNAVAILABLE_ERROR, json["error"]
  end

  test "audio serves already-cached audio even without a TTS toolchain" do
    user_entry = create_audio_user_entry
    entry = user_entry.entry

    FileUtils.mkdir_p(Rails.configuration.x.audio_cache.dir)
    filename = "test_#{SecureRandom.hex(8)}.wav"
    File.binwrite(Rails.configuration.x.audio_cache.dir.join(filename), "RIFF")

    cached = CachedAudio.create!(
      entry: entry,
      audio_filename: filename,
      content_hash: CachedAudio.hash_content(entry.content),
      duration: 1.5,
      timestamps: [ { "word" => "Hello", "start" => 0.0, "end" => 0.5 } ],
      cached_at: Time.current
    )

    begin
      TtsGenerator.stub(:available?, false) do
        get audio_api_v1_entry_url(user_entry), as: :json
      end

      assert_response :success
      json = JSON.parse(response.body)
      assert_equal "ready", json["status"]
      assert_equal cached.audio_url, json["audio_url"]
    ensure
      cached.destroy
    end
  end

  test "audio enqueues generation when TTS is available" do
    user_entry = create_audio_user_entry

    TtsGenerator.stub(:available?, true) do
      assert_enqueued_with job: GenerateArticleAudioJob, args: [ user_entry.entry.id ] do
        get audio_api_v1_entry_url(user_entry), as: :json
      end
    end

    assert_response :success
    assert_equal "generating", JSON.parse(response.body)["status"]
  end

  def create_linked_user_entry(link)
    entry = Entry.create!(
      guid: "embed-entry-#{SecureRandom.uuid}",
      title: "Framed Article",
      link: link,
      content: "<p>Hello World</p>",
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )
  end

  test "embed_policy reports the refusal a site's headers declare" do
    link = "https://blocked.example/article"
    user_entry = create_linked_user_entry(link)
    stub_request(:head, link).to_return(status: 200, headers: { "X-Frame-Options" => "DENY" })

    get embed_policy_api_v1_entry_url(user_entry), as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "blocked", json["status"]
    assert_equal "x-frame-options: deny", json["reason"]
  end

  test "embed_policy reports embeddable when nothing refuses the frame" do
    link = "https://open.example/article"
    user_entry = create_linked_user_entry(link)
    stub_request(:head, link).to_return(status: 200, headers: {})

    get embed_policy_api_v1_entry_url(user_entry), as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "embeddable", json["status"]
    assert_nil json["reason"]
  end

  # The probe reads the entry's stored link and nothing else, so the endpoint
  # cannot be turned into a request forwarder pointed at an arbitrary host.
  test "embed_policy probes the entry's own link, not a url the caller supplies" do
    link = "https://open.example/article"
    user_entry = create_linked_user_entry(link)
    stub_request(:head, link).to_return(status: 200, headers: {})

    get embed_policy_api_v1_entry_url(user_entry, url: "https://attacker.example/internal"), as: :json

    assert_response :success
    assert_requested :head, link
    assert_not_requested :head, "https://attacker.example/internal"
  end

  # The endpoint fetches inline, so both the body and the time it takes to
  # produce it are readable by anything that can open an article. A refused
  # destination opens no socket at all, so neither one says whether something
  # is listening on the port the link names.
  test "embed_policy says the same thing about every internal address it refuses" do
    bodies = [ "http://127.0.0.1:5432/", "http://127.0.0.1:1/", "http://169.254.169.254/latest/meta-data/" ].map do |link|
      user_entry = create_linked_user_entry(link)
      get embed_policy_api_v1_entry_url(user_entry), as: :json

      assert_response :success
      response.body
    end

    assert_equal 1, bodies.uniq.size, "the reason distinguishes one internal target from another"
    assert_equal({ "status" => "unknown", "reason" => EmbedPolicyProbe::UNKNOWN_REASON }, JSON.parse(bodies.first))
    assert_not_requested :head, "http://127.0.0.1:5432/"
  end

  test "embed_policy will not answer for another user's entry" do
    link = "https://private.example/article"
    user_entry = create_linked_user_entry(link)
    # setup signs in User.first, which fixture id ordering decides; name the
    # other user by exclusion rather than by fixture label.
    sign_in(User.where.not(id: @user.id).first)

    get embed_policy_api_v1_entry_url(user_entry), as: :json

    assert_response :not_found
    assert_not_requested :head, link
  end

  # --- summaries ------------------------------------------------------------

  SUMMARY_SENTENCE = "The commission said the brokers misreported client holdings across nine quarters. ".freeze

  # Above EntrySummarizer::MIN_CONTENT_CHARS once the tags are stripped, so the
  # feature is actually offered for it.
  def create_summarizable_user_entry(content: nil)
    body = content || "<p>#{SUMMARY_SENTENCE * 25}</p>"
    entry = Entry.create!(
      guid: "summary-entry-#{SecureRandom.uuid}",
      title: "Regulator settles with three brokers",
      link: "https://example.com/summary-article",
      content: body,
      content_hash: SecureRandom.hex(8),
      updated: 1.hour.ago,
      date_entered: 1.hour.ago,
      date_updated: Time.current
    )

    @user.user_entries.create!(
      entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: true
    )
  end

  def create_entry_summary(entry, content_hash: nil, text: "A paragraph about the settlement.")
    EntrySummary.create!(
      entry: entry,
      summary: text,
      model: "gemma4:e4b",
      content_hash: content_hash || entry.content_hash,
      generated_at: 1.hour.ago
    )
  end

  test "summarize enqueues one generation and answers without waiting for it" do
    user_entry = create_summarizable_user_entry

    assert_enqueued_with job: SummarizeEntryJob, args: [ user_entry.entry.id ] do
      post summarize_api_v1_entry_url(user_entry), as: :json
    end

    assert_response :success
    assert_equal "queued", JSON.parse(response.body)["status"]
  end

  # Pressing the button on an article that already has a current summary must
  # not spend model throughput regenerating what is already there.
  test "summarize returns a current summary and enqueues nothing" do
    user_entry = create_summarizable_user_entry
    summary = create_entry_summary(user_entry.entry)

    assert_no_enqueued_jobs only: SummarizeEntryJob do
      post summarize_api_v1_entry_url(user_entry), as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "ready", json["status"]
    assert_equal summary.summary, json.dig("summary", "summary")
    assert_equal false, json.dig("summary", "stale")
  end

  # Reaching this action with a stale summary on file is the regenerate control
  # being pressed; nothing else calls it in that state.
  test "summarize regenerates over a summary written against superseded text" do
    user_entry = create_summarizable_user_entry
    create_entry_summary(user_entry.entry, content_hash: "a-hash-the-entry-no-longer-has")

    assert_enqueued_with job: SummarizeEntryJob, args: [ user_entry.entry.id ] do
      post summarize_api_v1_entry_url(user_entry), as: :json
    end

    assert_equal "queued", JSON.parse(response.body)["status"]
  end

  # Excerpt-only feeds. Summarizing two sentences produces a summary no shorter
  # than its input and spends throughput other articles are queued behind.
  test "summarize refuses an article with too little text and enqueues nothing" do
    user_entry = create_summarizable_user_entry(content: "<p>Two sentences. That is all there is.</p>")

    assert_no_enqueued_jobs only: SummarizeEntryJob do
      post summarize_api_v1_entry_url(user_entry), as: :json
    end

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal "too_short", json["status"]
    assert_operator json["content_length"], :<, EntrySummarizer::MIN_CONTENT_CHARS
  end

  test "summarize will not answer for another user's entry" do
    user_entry = create_summarizable_user_entry
    sign_in(User.where.not(id: @user.id).first)

    assert_no_enqueued_jobs only: SummarizeEntryJob do
      post summarize_api_v1_entry_url(user_entry), as: :json
    end

    assert_response :not_found
  end

  # Re-opening a summarized article shows the paragraph with no request and no
  # model time.
  test "show carries a cached summary with the article" do
    user_entry = create_summarizable_user_entry
    summary = create_entry_summary(user_entry.entry)

    get api_v1_entry_url(user_entry), as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert_equal summary.summary, json.dig("summary", "summary")
    assert_equal "gemma4:e4b", json.dig("summary", "model")
    assert_equal false, json.dig("summary", "stale")
  end

  # The client never sees a content hash, so it cannot work this out for itself.
  # A stale summary is still shown, labelled, with a regenerate control.
  test "show marks a summary written against superseded text as stale" do
    user_entry = create_summarizable_user_entry
    create_entry_summary(user_entry.entry, content_hash: "a-hash-the-entry-no-longer-has")

    get api_v1_entry_url(user_entry), as: :json

    assert_equal true, JSON.parse(response.body).dig("summary", "stale")
  end

  test "show says nothing about a summary for an article that has none" do
    user_entry = create_summarizable_user_entry

    get api_v1_entry_url(user_entry), as: :json

    assert_nil JSON.parse(response.body)["summary"]
  end

  # So the affordance can say why it is absent rather than being offered and
  # refused.
  test "show says whether the article has enough text to summarize" do
    long = create_summarizable_user_entry
    short = create_summarizable_user_entry(content: "<p>Two sentences. That is all.</p>")

    get api_v1_entry_url(long), as: :json
    assert_equal true, JSON.parse(response.body)["summarizable"]

    get api_v1_entry_url(short), as: :json
    assert_equal false, JSON.parse(response.body)["summarizable"]
  end

  # The list does not render summaries, and answering `summarizable` costs a
  # pass over each article's whole body.
  test "the entry list carries neither summaries nor the summarizable flag" do
    user_entry = create_summarizable_user_entry
    create_entry_summary(user_entry.entry)

    get api_v1_entries_url, params: { per_page: 100 }, as: :json

    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == user_entry.id }
    assert_not_nil row
    assert_not row.key?("summary")
    assert_not row.key?("summarizable")
  end

  # ==========================
  # Fetching the full article
  # ==========================
  #
  # Every request below is answered by WebMock. test_helper disables outbound
  # connections for the whole suite, so an unstubbed publisher raises rather
  # than being visited.

  ARTICLE_PARAGRAPH = "The council voted 5-2 to reject the rezoning, ending a two-year fight " \
                      "over the parcel on Fourth Street, which neighbours had opposed since 2024.".freeze

  PUBLISHER_PAGE = "<html><body><div class='content'>" \
                   "<p>#{ARTICLE_PARAGRAPH}</p><p>#{ARTICLE_PARAGRAPH}</p><p>#{ARTICLE_PARAGRAPH}</p>" \
                   "</div></body></html>".freeze

  def create_excerpt_user_entry
    create_summarizable_user_entry(content: "<p>Two sentences. That is all this feed sends.</p>")
  end

  def stub_publisher(status: 200, body: PUBLISHER_PAGE)
    stub_request(:get, "https://example.com/summary-article")
      .to_return(status: status, body: body, headers: { "Content-Type" => "text/html" })
  end

  def store_full_text(entry, **attributes)
    entry.create_entry_full_text!({
      status: EntryFullText::OK,
      content: "<p>#{ARTICLE_PARAGRAPH}</p>",
      char_count: ARTICLE_PARAGRAPH.length,
      content_hash: entry.content_hash,
      fetched_at: Time.current
    }.merge(attributes))
  end

  test "full_text fetches the publisher's page and answers with the article" do
    user_entry = create_excerpt_user_entry
    stub_publisher

    post full_text_api_v1_entry_url(user_entry), as: :json

    assert_response :success
    payload = JSON.parse(response.body)["full_text"]
    assert_equal "ready", payload["status"]
    assert_includes payload["content"], "voted 5-2"
    assert_operator payload["char_count"], :>, 0
  end

  # One message, no cause. A 403 from a bot filter, a paywall and a timeout are
  # not distinguishable from this side, and guessing between them is worse than
  # saying nothing.
  test "full_text answers with one generic message when the page cannot be read" do
    user_entry = create_excerpt_user_entry
    stub_publisher(status: 403, body: "denied")

    post full_text_api_v1_entry_url(user_entry), as: :json

    assert_response :success
    payload = JSON.parse(response.body)["full_text"]
    assert_equal "unavailable", payload["status"]
    assert_equal EntryFullText::UNAVAILABLE_MESSAGE, payload["message"]
    assert_not_includes response.body, "403"
  end

  test "full_text does not ask the publisher again while a recent failure stands" do
    user_entry = create_excerpt_user_entry
    store_full_text(user_entry.entry, status: EntryFullText::FAILED, content: "", char_count: 0, fetched_at: 5.minutes.ago)

    post full_text_api_v1_entry_url(user_entry), as: :json

    assert_equal "unavailable", JSON.parse(response.body).dig("full_text", "status")
    assert_not_requested :get, "https://example.com/summary-article"
  end

  test "full_text returns a stored article without asking the publisher again" do
    user_entry = create_excerpt_user_entry
    store_full_text(user_entry.entry)

    post full_text_api_v1_entry_url(user_entry), as: :json

    assert_equal "ready", JSON.parse(response.body).dig("full_text", "status")
    assert_not_requested :get, "https://example.com/summary-article"
  end

  # The URL fetched comes from the entry, and the entry comes from this user's
  # own subscriptions, so this endpoint cannot be aimed anywhere else.
  test "full_text will not answer for another user's entry" do
    user_entry = create_excerpt_user_entry
    sign_in(User.where.not(id: @user.id).first)

    post full_text_api_v1_entry_url(user_entry), as: :json

    assert_response :not_found
    assert_not_requested :get, "https://example.com/summary-article"
  end

  test "show carries a fetched article with the entry" do
    user_entry = create_excerpt_user_entry
    store_full_text(user_entry.entry)

    get api_v1_entry_url(user_entry), as: :json

    payload = JSON.parse(response.body)["full_text"]
    assert_equal "ready", payload["status"]
    assert_includes payload["content"], "voted 5-2"
  end

  # So a reader re-opening the article is told why there is no full text,
  # instead of pressing a button and waiting for a fetch that will not happen.
  test "show carries the generic message for a fetch that failed" do
    user_entry = create_excerpt_user_entry
    store_full_text(user_entry.entry, status: EntryFullText::FAILED, content: "", char_count: 0)

    get api_v1_entry_url(user_entry), as: :json

    payload = JSON.parse(response.body)["full_text"]
    assert_equal "unavailable", payload["status"]
    assert_equal EntryFullText::UNAVAILABLE_MESSAGE, payload["message"]
  end

  # Nothing settled: the reader may ask.
  test "show says nothing about full text when none has been fetched" do
    user_entry = create_excerpt_user_entry

    get api_v1_entry_url(user_entry), as: :json

    assert_nil JSON.parse(response.body)["full_text"]
  end

  test "show says nothing about a failure old enough to be worth retrying" do
    user_entry = create_excerpt_user_entry
    store_full_text(
      user_entry.entry, status: EntryFullText::FAILED, content: "", char_count: 0,
      fetched_at: EntryFullText::RETRY_AFTER.ago - 1.minute
    )

    get api_v1_entry_url(user_entry), as: :json

    assert_nil JSON.parse(response.body)["full_text"]
  end

  test "the entry list does not carry fetched articles" do
    user_entry = create_excerpt_user_entry
    store_full_text(user_entry.entry)

    get api_v1_entries_url, params: { per_page: 100 }, as: :json

    row = JSON.parse(response.body)["entries"].find { |e| e["id"] == user_entry.id }
    assert_not_nil row
    assert_not row.key?("full_text")
  end
end
