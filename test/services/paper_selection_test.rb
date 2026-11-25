require "test_helper"

class PaperSelectionTest < ActiveSupport::TestCase
  setup do
    freeze_time
    @user = users(:one)
    @feed = feeds(:high_frequency)
    @ruby = paper_tag(@user, "ruby", limit: 2)
  end

  test "caps at paper_limit and picks the longest" do
    candidate("medium", tags: [ @ruby ], words: 1500)
    candidate("longest", tags: [ @ruby ], words: 3000)
    candidate("shortest", tags: [ @ruby ], words: 400)

    result = run_selection.sole

    assert_equal 3, result.candidates
    assert_equal %w[longest medium], titles(result.published)
    assert_equal %w[longest medium], published_titles
  end

  test "breaks a word-count tie on the lower link density" do
    @ruby.update!(paper_limit: 1)
    candidate("linky", tags: [ @ruby ], words: 1000, density: 3.0)
    candidate("plain", tags: [ @ruby ], words: 1000, density: 0.5)

    run_selection

    assert_equal %w[plain], published_titles
  end

  test "requires at least MIN_WORDS and less than MAX_LINK_DENSITY" do
    @ruby.update!(paper_limit: 10)
    candidate("at floor", tags: [ @ruby ], words: PaperSelection::MIN_WORDS)
    candidate("short", tags: [ @ruby ], words: PaperSelection::MIN_WORDS - 1)
    candidate("under ceiling", tags: [ @ruby ], density: 4.9)
    candidate("link heavy", tags: [ @ruby ], density: PaperSelection::MAX_LINK_DENSITY)
    candidate("unmeasured", tags: [ @ruby ], words: nil, density: nil)

    run_selection

    assert_equal [ "under ceiling", "at floor" ], published_titles
  end

  test "requires a usable full text" do
    @ruby.update!(paper_limit: 10)
    candidate("usable", tags: [ @ruby ])
    candidate("no fetch", tags: [ @ruby ], full_text: nil)
    candidate("failed fetch", tags: [ @ruby ], full_text: EntryFullText::FAILED)
    stale = candidate("stale fetch", tags: [ @ruby ])
    stale.entry.update!(content_hash: "edited-since")

    run_selection

    assert_equal %w[usable], published_titles
  end

  test "considers only entries entered within the window" do
    candidate("inside", tags: [ @ruby ], entered: PaperSelection::WINDOW.ago + 1.minute)
    candidate("too old", tags: [ @ruby ], entered: PaperSelection::WINDOW.ago - 1.minute)

    run_selection

    assert_equal %w[inside], published_titles
  end

  test "a window override widens the pool" do
    candidate("ten days old", tags: [ @ruby ], entered: 10.days.ago)

    PaperSelection.run(window: 14.days)

    assert_equal [ "ten days old" ], published_titles
  end

  test "hand-published entries are neither candidates nor counted against the limit" do
    @ruby.update!(paper_limit: 1)
    hand = candidate("by hand", tags: [ @ruby ], words: 5000)
    hand.publish!
    candidate("picked", tags: [ @ruby ], words: 1000)

    result = run_selection.sole

    assert_equal 1, result.candidates
    assert_equal %w[picked], titles(result.published)
    assert_nil hand.reload.paper_tag
  end

  test "an entry tagged with two marked tags is picked once, by the first tag in name order" do
    rails = paper_tag(@user, "rails", limit: 1)
    @ruby.update!(paper_limit: 1)
    shared = candidate("shared", tags: [ rails, @ruby ], words: 5000)
    candidate("ruby only", tags: [ @ruby ], words: 1000)

    by_tag = run_selection.index_by { |result| result.tag.name }

    assert_equal %w[shared], titles(by_tag["rails"].published)
    assert_equal [ "ruby only" ], titles(by_tag["ruby"].published)
    assert_equal rails, shared.reload.paper_tag
  end

  test "an article that reached the user by two feeds is published once" do
    @ruby.update!(paper_limit: 5)
    first = candidate("twice", tags: [ @ruby ])
    @user.user_entries.create!(entry: first.entry, feed: feeds(:low_frequency), uuid: SecureRandom.uuid)

    run_selection
    run_selection

    assert_equal 1, @user.user_entries.where(entry: first.entry).published.count
  end

  test "an article hand-published through one feed is not picked through the other" do
    hand = candidate("twice", tags: [ @ruby ])
    hand.publish!
    @user.user_entries.create!(entry: hand.entry, feed: feeds(:low_frequency), uuid: SecureRandom.uuid)

    assert_equal 0, run_selection.sole.candidates
    assert_equal 1, @user.user_entries.where(entry: hand.entry).published.count
  end

  test "tags not marked for the paper are ignored" do
    unmarked = @user.tags.create!(name: "elixir")
    candidate("elixir post", tags: [ unmarked ])

    assert_equal [ @ruby ], run_selection.map(&:tag)
    assert_empty published_titles
  end

  test "each user's tags select only that user's rows" do
    other = users(:two)
    other_tag = paper_tag(other, "ruby", limit: 5)
    theirs = candidate("both read it", tags: [ other_tag ])
    mine = @user.user_entries.create!(entry: theirs.entry, feed: @feed, uuid: SecureRandom.uuid)
    candidate("mine", tags: [ @ruby ])

    results = run_selection

    assert_equal [ "mine" ], titles(results.find { |r| r.tag == @ruby }.published)

    assert_not mine.reload.published, "user one's ruby tag does not carry this entry"
    assert theirs.reload.published
    assert_equal other_tag, theirs.paper_tag
  end

  test "running twice in the same morning publishes nothing new" do
    5.times { |i| candidate("post #{i}", tags: [ @ruby ], words: 1000 + i) }
    run_selection

    travel 1.hour
    second = run_selection.sole

    assert_equal 5, second.candidates
    assert_empty second.published
    assert_equal 2, @user.user_entries.published.count
  end

  test "an unpublished pick still fills its slot and is not republished" do
    @ruby.update!(paper_limit: 1)
    first = candidate("unwanted", tags: [ @ruby ], words: 3000)
    candidate("runner up", tags: [ @ruby ], words: 1000)
    run_selection
    first.reload.toggle_published!

    assert_empty run_selection.sole.published
    assert_empty published_titles
  end

  test "next week's run picks from next week's entries" do
    candidate("last week", tags: [ @ruby ])
    run_selection

    travel PaperSelection::WINDOW
    candidate("this week", tags: [ @ruby ])

    assert_equal [ "this week" ], titles(run_selection.sole.published)
  end

  private

  def run_selection
    PaperSelection.run
  end

  def paper_tag(user, name, limit:)
    user.tags.create!(name: name, include_in_paper: true, paper_limit: limit)
  end

  def candidate(title, tags:, words: 1000, density: 1.0, entered: 1.day.ago, full_text: EntryFullText::OK)
    entry = Entry.create!(
      guid: "paper-#{title.parameterize}",
      title: title,
      link: "https://example.com/#{title.parameterize}",
      content: "<p>Excerpt</p>",
      content_hash: "hash-#{title.parameterize}",
      updated: entered,
      date_entered: entered,
      date_updated: entered,
      word_count: words,
      link_density: density
    )
    tags.each { |tag| EntryTag.add_manual(entry: entry, tag: tag) }
    if full_text
      entry.create_entry_full_text!(status: full_text, content: "<p>Article</p>",
        content_hash: entry.content_hash, fetched_at: Time.current)
    end
    tags.first.user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid)
  end

  def titles(rows)
    rows.map { |row| row.entry.title }
  end

  def published_titles
    @user.user_entries.published.joins(:entry)
      .order("entries.word_count DESC, entries.link_density ASC").map { |row| row.entry.title }
  end
end
