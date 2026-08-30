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

  test "returns a snippet around the match" do
    subscribe(create_entry(title: "Nothing To See", content: "<p>The wombat burrow collapsed overnight.</p>"))

    get api_v1_search_url, params: { q: "wombat" }

    assert_response :success
    assert_includes json["entries"].first["snippet"], "wombat"
  end

  private

  def json = @json ||= JSON.parse(response.body)

  def titles = json["entries"].map { |e| e["title"] }

  def create_entry(title:, content: "<p>Nothing to see.</p>", date_entered: Time.current)
    Entry.create!(
      guid: "search-#{SecureRandom.uuid}",
      title: title,
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: content,
      content_hash: SecureRandom.hex(8),
      author: "",
      updated: Time.current,
      date_entered: date_entered,
      date_updated: Time.current
    )
  end

  def subscribe(entry, feed: @feed)
    @user.user_entries.create!(entry: entry, feed: feed, uuid: SecureRandom.uuid)
  end
end
