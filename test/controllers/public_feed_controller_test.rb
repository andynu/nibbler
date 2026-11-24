require "test_helper"

class PublicFeedControllerTest < ActionDispatch::IntegrationTest
  ATOM_NS = { "atom" => "http://www.w3.org/2005/Atom" }.freeze
  FULL_TEXT = "<p>#{'The whole article as its publisher printed it. ' * 10}</p>".freeze

  setup do
    @user = users(:one)
    @key = @user.ensure_access_key!
    @feed = feeds(:high_frequency)
  end

  test "an entry with usable full text is listed with the full text as its content" do
    entry = published_entry("full", last_published: 5.minutes.ago)
    full_text(entry, EntryFullText::OK, FULL_TEXT)

    entries = fetch_feed

    assert_equal [ "full" ], titles(entries)
    assert_equal FULL_TEXT, entries.first.at_xpath("atom:content", ATOM_NS).text
  end

  test "a fresh entry with no fetch yet is held back until the grace period passes" do
    published_entry("fresh", last_published: 10.minutes.ago, content: "<p>The excerpt</p>")

    assert_empty fetch_feed

    travel 3.hours do
      entries = fetch_feed

      assert_equal [ "fresh" ], titles(entries)
      assert_equal "<p>The excerpt</p>", entries.first.at_xpath("atom:content", ATOM_NS).text
    end
  end

  test "an entry whose fetch failed is listed at once with the feed's excerpt" do
    entry = published_entry("failed", last_published: 5.minutes.ago, content: "<p>The excerpt</p>")
    full_text(entry, EntryFullText::FAILED, "")

    entries = fetch_feed

    assert_equal [ "failed" ], titles(entries)
    assert_equal "<p>The excerpt</p>", entries.first.at_xpath("atom:content", ATOM_NS).text
  end

  test "an entry with a blank body and a failed fetch is never listed, even past the grace period" do
    entry = published_entry("empty", last_published: 3.hours.ago, content: "  \n ")
    full_text(entry, EntryFullText::FAILED, "")

    assert_empty fetch_feed
  end

  test "a published row with no last_published is listed after dated rows" do
    published_entry("legacy", last_published: nil, date_entered: 1.minute.ago, content: "<p>Old</p>")
    dated = published_entry("dated", last_published: 3.hours.ago, date_entered: 1.year.ago)
    full_text(dated, EntryFullText::OK, FULL_TEXT)

    assert_equal %w[dated legacy], titles(fetch_feed)
  end

  test "order follows last_published, not date_entered" do
    older_article = published_entry("published later", last_published: 1.hour.ago, date_entered: 2.days.ago)
    newer_article = published_entry("published earlier", last_published: 2.hours.ago, date_entered: 1.hour.ago)
    full_text(older_article, EntryFullText::OK, FULL_TEXT)
    full_text(newer_article, EntryFullText::OK, FULL_TEXT)

    assert_equal [ "published later", "published earlier" ], titles(fetch_feed)
  end

  test "unpublished entries are not listed" do
    entry = published_entry("unpublished", last_published: 3.hours.ago)
    full_text(entry, EntryFullText::OK, FULL_TEXT)
    @user.user_entries.find_by!(entry: entry).update!(published: false, last_published: nil)

    assert_empty fetch_feed
  end

  test "each entry carries what the morning-paper ingester requires" do
    entry = published_entry("contract", last_published: 5.minutes.ago, author: "A. Writer")
    full_text(entry, EntryFullText::OK, FULL_TEXT)
    user_entry = @user.user_entries.find_by!(entry: entry)

    get public_feed_path(access_key: @key, format: :atom)
    assert_response :success
    doc = Nokogiri::XML(response.body)

    assert_equal "http://www.w3.org/2005/Atom", doc.root.namespace.href
    assert_equal "feed", doc.root.name

    atom_entry = doc.at_xpath("/atom:feed/atom:entry", ATOM_NS)
    assert_equal "urn:uuid:#{user_entry.uuid}", atom_entry.at_xpath("atom:id", ATOM_NS).text
    assert_equal "contract", atom_entry.at_xpath("atom:title", ATOM_NS).text
    assert_equal "https://example.com/contract",
      atom_entry.at_xpath("atom:link[@rel='alternate']/@href", ATOM_NS).value
    content = atom_entry.at_xpath("atom:content", ATOM_NS)
    assert_equal "html", content["type"]
    assert_includes response.body, "&lt;p&gt;The whole article"
    assert atom_entry.at_xpath("atom:published", ATOM_NS).text.present?
    assert atom_entry.at_xpath("atom:updated", ATOM_NS).text.present?
    assert_equal "A. Writer", atom_entry.at_xpath("atom:author/atom:name", ATOM_NS).text
  end

  test "an unknown access key is not found" do
    get public_feed_path(access_key: "no-such-key", format: :atom)

    assert_response :not_found
  end

  private

  def published_entry(title, last_published:, date_entered: Time.current, content: "<p>Body</p>", author: "")
    entry = Entry.create!(
      guid: "public-feed-#{title}",
      title: title,
      link: "https://example.com/#{title.parameterize}",
      content: content,
      content_hash: "hash-#{title.parameterize}",
      author: author,
      updated: date_entered,
      date_entered: date_entered,
      date_updated: date_entered
    )
    @user.user_entries.create!(
      entry: entry,
      feed: @feed,
      uuid: SecureRandom.uuid,
      published: true,
      last_published: last_published
    )
    entry
  end

  def full_text(entry, status, content)
    entry.create_entry_full_text!(
      status: status,
      content: content,
      char_count: content.length,
      content_hash: entry.content_hash,
      fetched_at: Time.current
    )
  end

  def fetch_feed
    get public_feed_path(access_key: @key, format: :atom)
    assert_response :success
    Nokogiri::XML(response.body).xpath("/atom:feed/atom:entry", ATOM_NS)
  end

  def titles(entries)
    entries.map { |e| e.at_xpath("atom:title", ATOM_NS).text }
  end
end
