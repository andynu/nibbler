require "test_helper"

# Search is exercised end to end: an entry is saved through the model, then
# looked up over HTTP. Nothing assigns tsvector_combined and nothing stubs
# Entry.search, because a test that did either would have passed for the whole
# time the index was empty in production.
class Api::V1::SearchControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = sign_in(users(:one))
    @feed = feeds(:high_frequency)
  end

  test "finds an entry the signed-in user subscribes to by a title word" do
    subscribe(create_entry(title: "Quokkas Return To Rottnest"))

    get api_v1_search_url, params: { q: "quokkas" }

    assert_response :success
    assert_equal [ "Quokkas Return To Rottnest" ], titles
    assert_equal 1, json["pagination"]["total"]
  end

  test "finds an entry by a body word" do
    subscribe(create_entry(title: "Nothing To See", content: "<p>The wombat burrow collapsed.</p>"))

    get api_v1_search_url, params: { q: "wombat" }

    assert_response :success
    assert_equal [ "Nothing To See" ], titles
  end

  test "returns nothing for a word no entry contains" do
    subscribe(create_entry(title: "Quokkas Return To Rottnest"))

    get api_v1_search_url, params: { q: "platypus" }

    assert_response :success
    assert_empty json["entries"]
    assert_equal 0, json["pagination"]["total"]
  end

  test "does not return an entry another user subscribes to" do
    entry = create_entry(title: "Quokkas Return To Rottnest")
    other_feed = Feed.create!(user: users(:two), title: "Other", feed_url: "https://example.com/other.rss")
    users(:two).user_entries.create!(entry: entry, feed: other_feed, uuid: SecureRandom.uuid)

    get api_v1_search_url, params: { q: "quokkas" }

    assert_response :success
    assert_empty json["entries"]
  end

  test "restricts results to a feed when feed_id is given" do
    subscribe(create_entry(title: "Quokkas On The Beach"))
    other_feed = Feed.create!(user: @user, title: "Second", feed_url: "https://example.com/second.rss")
    subscribe(create_entry(title: "Quokkas In The Scrub"), feed: other_feed)

    get api_v1_search_url, params: { q: "quokkas", feed_id: other_feed.id }

    assert_response :success
    assert_equal [ "Quokkas In The Scrub" ], titles
  end

  # The two entries below are seeded so relevance order and date order
  # disagree: the denser match is the older row. An assertion that held under
  # either ordering would prove nothing.
  test "puts the denser match first even when a thinner one is newer" do
    subscribe(create_entry(
      title: "Nothing To See",
      content: "<p>A quokka appeared once.</p>",
      date_entered: Time.current
    ))
    subscribe(create_entry(
      title: "Quokka Quokka Quokka",
      content: "<p>Quokka quokka quokka quokka.</p>",
      date_entered: 1.week.ago
    ))

    get api_v1_search_url, params: { q: "quokka" }

    assert_response :success
    assert_equal [ "Quokka Quokka Quokka", "Nothing To See" ], titles
  end

  test "breaks a relevance tie with the more recent entry" do
    subscribe(create_entry(
      title: "Quokka Report Alpha",
      content: "<p>A quokka.</p>",
      date_entered: 1.week.ago
    ))
    subscribe(create_entry(
      title: "Quokka Report Beta",
      content: "<p>A quokka.</p>",
      date_entered: Time.current
    ))

    get api_v1_search_url, params: { q: "quokka" }

    assert_response :success
    assert_equal [ "Quokka Report Beta", "Quokka Report Alpha" ], titles
  end

  test "returns a snippet around the match, with the match delimited" do
    subscribe(create_entry(title: "Nothing To See", content: "<p>The wombat burrow collapsed overnight.</p>"))

    get api_v1_search_url, params: { q: "wombat" }

    assert_response :success
    assert_includes json["entries"].first["snippet"], marked("wombat")
  end

  # The case substring matching cannot reach, and the reason ts_headline is
  # here. "studies" stems to "studi", which matches a body that says "study", so
  # the row comes back ranked -- and a /studies/i scan over that body finds
  # nothing, so the excerpt used to fall back to the opening of the article and
  # the reader got a hit with no visible reason for it. The filler is what makes
  # that fallback wrong rather than accidentally right: "study" is well past the
  # first 200 characters.
  test "excerpts around a match the query only reaches by stemming" do
    subscribe(create_entry(
      title: "Nothing To See",
      content: "<p>#{"Filler about bandicoots. " * 12}The study of quokkas concluded.</p>"
    ))

    get api_v1_search_url, params: { q: "studies" }

    assert_response :success
    snippet = json["entries"].first["snippet"]
    assert_includes snippet, "study"
    assert_includes snippet, marked("study")
  end

  test "leaves the entry title unmarked so it stays the plain title" do
    subscribe(create_entry(title: "Quokkas Return To Rottnest"))

    get api_v1_search_url, params: { q: "quokkas" }

    assert_response :success
    assert_equal "Quokkas Return To Rottnest", json["entries"].first["title"]
  end

  # Every scoping test below seeds a match on BOTH sides of the filter, so an
  # assertion that still held with the filter deleted would fail here.

  test "restricts results to unread when unread=true" do
    subscribe(create_entry(title: "Quokka Unread"))
    subscribe(create_entry(title: "Quokka Read"), unread: false)

    get api_v1_search_url, params: { q: "quokka", unread: "true" }

    assert_response :success
    assert_equal [ "Quokka Unread" ], titles
    assert_equal 1, json["pagination"]["total"]
  end

  test "restricts results to read when unread=false" do
    subscribe(create_entry(title: "Quokka Unread"))
    subscribe(create_entry(title: "Quokka Read"), unread: false)

    get api_v1_search_url, params: { q: "quokka", unread: "false" }

    assert_response :success
    assert_equal [ "Quokka Read" ], titles
  end

  test "searches regardless of read state when unread is omitted" do
    subscribe(create_entry(title: "Quokka Unread"))
    subscribe(create_entry(title: "Quokka Read"), unread: false)

    get api_v1_search_url, params: { q: "quokka" }

    assert_response :success
    assert_equal 2, json["pagination"]["total"]
  end

  test "restricts results to starred when starred=true" do
    subscribe(create_entry(title: "Quokka Starred"), marked: true)
    subscribe(create_entry(title: "Quokka Plain"))

    get api_v1_search_url, params: { q: "quokka", starred: "true" }

    assert_response :success
    assert_equal [ "Quokka Starred" ], titles
  end

  test "restricts results to starred for view=starred" do
    subscribe(create_entry(title: "Quokka Starred"), marked: true)
    subscribe(create_entry(title: "Quokka Plain"))

    get api_v1_search_url, params: { q: "quokka", view: "starred" }

    assert_response :success
    assert_equal [ "Quokka Starred" ], titles
  end

  test "restricts results to published for view=published" do
    subscribe(create_entry(title: "Quokka Published"), published: true)
    subscribe(create_entry(title: "Quokka Plain"))

    get api_v1_search_url, params: { q: "quokka", view: "published" }

    assert_response :success
    assert_equal [ "Quokka Published" ], titles
  end

  test "restricts results to read for view=archived" do
    subscribe(create_entry(title: "Quokka Archived"), unread: false)
    subscribe(create_entry(title: "Quokka Plain"))

    get api_v1_search_url, params: { q: "quokka", view: "archived" }

    assert_response :success
    assert_equal [ "Quokka Archived" ], titles
  end

  # The decoy carries a tag of the same name owned by another user, so a filter
  # that matched on name alone would return it.
  test "restricts results to the current user's tag when tag is given" do
    tagged = create_entry(title: "Quokka Tagged")
    decoy = create_entry(title: "Quokka Untagged")
    subscribe(tagged)
    subscribe(decoy)
    apply_tag(tagged, name: "marsupials", owner: @user)
    apply_tag(decoy, name: "marsupials", owner: users(:two))

    get api_v1_search_url, params: { q: "quokka", tag: "marsupials" }

    assert_response :success
    assert_equal [ "Quokka Tagged" ], titles
  end

  test "matches a tag case-insensitively and ignores surrounding space" do
    tagged = create_entry(title: "Quokka Tagged")
    subscribe(tagged)
    subscribe(create_entry(title: "Quokka Untagged"))
    apply_tag(tagged, name: "marsupials", owner: @user)

    get api_v1_search_url, params: { q: "quokka", tag: "  Marsupials " }

    assert_response :success
    assert_equal [ "Quokka Tagged" ], titles
  end

  # Fresh is unread AND published inside the window, so the two decoys fail one
  # half each.
  test "restricts results to the Fresh window for view=fresh" do
    subscribe(create_entry(title: "Quokka Fresh", updated: 1.hour.ago))
    subscribe(create_entry(title: "Quokka Stale", updated: 3.days.ago))
    subscribe(create_entry(title: "Quokka Fresh But Read", updated: 1.hour.ago), unread: false)

    get api_v1_search_url, params: { q: "quokka", view: "fresh" }

    assert_response :success
    assert_equal [ "Quokka Fresh" ], titles
  end

  test "widens the Fresh window when fresh_max_age is given" do
    subscribe(create_entry(title: "Quokka Recent", updated: 1.hour.ago))
    subscribe(create_entry(title: "Quokka Three Days Old", updated: 3.days.ago))
    subscribe(create_entry(title: "Quokka Two Months Old", updated: 2.months.ago))

    get api_v1_search_url, params: { q: "quokka", view: "fresh", fresh_max_age: "week" }

    assert_response :success
    assert_equal [ "Quokka Recent", "Quokka Three Days Old" ].sort, titles.sort
  end

  # "all" drops the age limit but not the rest of Fresh, so the read decoy is
  # still out. Without it this test would pass on a controller that ignored
  # view entirely.
  test "drops the age limit but not the unread half for fresh_max_age=all" do
    subscribe(create_entry(title: "Quokka Recent", updated: 1.hour.ago))
    subscribe(create_entry(title: "Quokka Two Months Old", updated: 2.months.ago))
    subscribe(create_entry(title: "Quokka Ancient But Read", updated: 2.months.ago), unread: false)

    get api_v1_search_url, params: { q: "quokka", view: "fresh", fresh_max_age: "all" }

    assert_response :success
    assert_equal [ "Quokka Recent", "Quokka Two Months Old" ].sort, titles.sort
  end

  # The cap keeps the newest matching article of each feed, so both feeds are
  # represented and the older half of each is dropped.
  test "caps Fresh results per feed when fresh_per_feed is given" do
    second_feed = Feed.create!(user: @user, title: "Second", feed_url: "https://example.com/second.rss")
    subscribe(create_entry(title: "Quokka One Newer", updated: 1.hour.ago))
    subscribe(create_entry(title: "Quokka One Older", updated: 5.hours.ago))
    subscribe(create_entry(title: "Quokka Two Newer", updated: 2.hours.ago), feed: second_feed)
    subscribe(create_entry(title: "Quokka Two Older", updated: 6.hours.ago), feed: second_feed)

    get api_v1_search_url, params: { q: "quokka", view: "fresh", fresh_per_feed: 1 }

    assert_response :success
    assert_equal [ "Quokka One Newer", "Quokka Two Newer" ].sort, titles.sort
  end

  # A category stands for its subtree on /entries, and search has to agree: the
  # match sits in a feed filed under a CHILD of the requested category.
  test "restricts results to a category and its descendants when category_id is given" do
    parent = Category.create!(user: @user, title: "Wildlife")
    child = Category.create!(user: @user, title: "Marsupials", parent: parent)
    child_feed = Feed.create!(user: @user, title: "Child", feed_url: "https://example.com/child.rss", category: child)
    subscribe(create_entry(title: "Quokka In Subtree"), feed: child_feed)
    subscribe(create_entry(title: "Quokka Outside"))

    get api_v1_search_url, params: { q: "quokka", category_id: parent.id }

    assert_response :success
    assert_equal [ "Quokka In Subtree" ], titles
  end

  test "does not scope to a category belonging to another user" do
    other_category = Category.create!(user: users(:two), title: "Theirs")
    subscribe(create_entry(title: "Quokka Ours"))

    get api_v1_search_url, params: { q: "quokka", category_id: other_category.id }

    assert_response :success
    assert_equal [ "Quokka Ours" ], titles
  end

  test "intersects the query with the scope rather than replacing it" do
    subscribe(create_entry(title: "Quokka Starred"), marked: true)
    subscribe(create_entry(title: "Wombat Starred"), marked: true)
    subscribe(create_entry(title: "Quokka Plain"))

    get api_v1_search_url, params: { q: "quokka", starred: "true" }

    assert_response :success
    assert_equal [ "Quokka Starred" ], titles
  end

  private

  def json = @json ||= JSON.parse(response.body)

  def titles = json["entries"].map { |e| e["title"] }

  # A run of snippet text as ts_headline delimits it when the query matched
  # there. The client splits on these to build its <mark> elements.
  def marked(text) = "#{Entry::HEADLINE_START}#{text}#{Entry::HEADLINE_STOP}"

  # +updated+ is the publication date, which is the clock the Fresh window and
  # its per-feed cap read; +date_entered+ is the import date, which breaks
  # relevance ties.
  def create_entry(title:, content: "<p>Nothing to see.</p>", date_entered: Time.current, updated: Time.current)
    Entry.create!(
      guid: "search-#{SecureRandom.uuid}",
      title: title,
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: content,
      content_hash: SecureRandom.hex(8),
      author: "",
      updated: updated,
      date_entered: date_entered,
      date_updated: Time.current
    )
  end

  def subscribe(entry, feed: @feed, unread: true, marked: false, published: false)
    @user.user_entries.create!(
      entry: entry,
      feed: feed,
      uuid: SecureRandom.uuid,
      unread: unread,
      marked: marked,
      published: published
    )
  end

  def apply_tag(entry, name:, owner:)
    tag = Tag.create!(user: owner, name: name)
    EntryTag.create!(entry: entry, tag: tag)
  end
end
