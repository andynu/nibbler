require "test_helper"

class TagRuleApplierTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  SENTENCE = "The council voted to reject the rezoning, ending a long fight over the " \
             "parcel on Fourth Street, which the neighbours had opposed for years now.".freeze

  setup do
    @user = users(:one)
    @other_user = users(:two)
    @tag = @user.tags.create!(name: "quokkas")
    @high = feeds(:high_frequency)
    @low = feeds(:low_frequency)

    @parent = @user.categories.create!(title: "Animals")
    @child = @user.categories.create!(title: "Marsupials", parent: @parent)
    @low.update!(category: @child)

    @in_high = entry_in(@high, title: "Quokka sighting", content: "<p>A quokka on Rottnest.</p>")
    @in_low = entry_in(@low, title: "Quokka census", content: "<p>Counting quokkas.</p>")
    @unrelated = entry_in(@high, title: "Wombat news", content: "<p>Burrows.</p>")
  end

  test "an everywhere rule tags matches in every feed, and only matches" do
    create_rule("quokka")

    assert_tagged @in_high, @in_low
    assert_not_tagged @unrelated
  end

  test "a feed rule tags only that feed's matches" do
    create_rule("quokka", feed: @high)

    assert_tagged @in_high
    assert_not_tagged @in_low
  end

  test "a category rule covers feeds filed under its subcategories" do
    create_rule("quokka", category: @parent)

    assert_tagged @in_low
    assert_not_tagged @in_high
  end

  test "the backfill records which rule matched which entry, as non-manual tags" do
    rule = create_rule("quokka", feed: @high)

    assert_equal [ @in_high.id ], rule.entry_tag_rule_matches.pluck(:entry_id)
    assert_not EntryTag.find_by(entry: @in_high, tag: @tag).manual
  end

  test "two feed rules for one tag are a union" do
    create_rule("quokka", feed: @high)
    create_rule("quokka", feed: @low)

    assert_tagged @in_high, @in_low
  end

  test "deleting one of two rules keeps the tag where the other still matches" do
    high_rule = create_rule("quokka", feed: @high)
    create_rule("quokka")

    high_rule.destroy!

    assert_tagged @in_high, @in_low
  end

  test "deleting a rule removes the tags only it applied" do
    rule = create_rule("quokka")

    rule.destroy!

    assert_not_tagged @in_high, @in_low
  end

  test "deleting a rule never removes a manual tag" do
    EntryTag.create!(entry: @in_high, tag: @tag)
    rule = create_rule("quokka")

    rule.destroy!

    assert_tagged @in_high
    assert_not_tagged @in_low
  end

  test "a hand-added tag on a rule-applied entry survives the rule" do
    rule = create_rule("quokka")
    EntryTag.add_manual(entry: @in_high, tag: @tag)

    rule.destroy!

    assert_tagged @in_high
    assert EntryTag.find_by(entry: @in_high, tag: @tag).manual
  end

  test "editing the query removes the matches that no longer hold" do
    rule = create_rule("quokka")

    perform_enqueued_jobs { rule.update!(query: "census") }

    assert_tagged @in_low
    assert_not_tagged @in_high
    assert_equal [ @in_low.id ], rule.entry_tag_rule_matches.pluck(:entry_id)
  end

  test "narrowing the scope removes the tags outside it" do
    rule = create_rule("quokka")

    perform_enqueued_jobs { rule.update!(feed: @low) }

    assert_tagged @in_low
    assert_not_tagged @in_high
  end

  test "moving a rule to another tag removes the old tag's rule-only rows" do
    rule = create_rule("quokka")
    other = @user.tags.create!(name: "marsupials")

    perform_enqueued_jobs { rule.update!(tag: other) }

    assert_not_tagged @in_high, @in_low
    assert_equal [ @in_high, @in_low ].map(&:id).sort, other.entries.pluck(:id).sort
  end

  test "an edit that changes nothing matching does not enqueue a backfill" do
    rule = create_rule("quokka")

    assert_no_enqueued_jobs(only: ApplyTagRuleJob) { rule.touch }
  end

  test "deleting the rule's feed prunes the tags it applied" do
    create_rule("quokka", feed: @low)

    @low.destroy!

    assert_not_tagged @in_low
  end

  test "deleting the rule's category prunes the tags it applied" do
    create_rule("quokka", category: @child)

    @child.destroy!

    assert_not_tagged @in_low
  end

  test "a rule reads only its owner's rows of a shared entry" do
    other_tag = @other_user.tags.create!(name: "quokkas")
    other_rule = perform_enqueued_jobs do
      other_tag.tag_rules.create!(user: @other_user, query: "quokka")
    end

    assert_empty other_rule.entry_tag_rule_matches

    other_feed = @other_user.feeds.create!(title: "Theirs", feed_url: "https://example.com/theirs.rss")
    subscribe(@other_user, other_feed, @in_high)
    perform_enqueued_jobs { ApplyTagRuleJob.perform_later(other_rule.id) }

    assert_equal [ @in_high.id ], other_tag.entries.pluck(:id)
    assert_empty @tag.entries, "the other reader's rule must not touch this reader's tag"
  end

  # The rule is a saved search, so each case compares it against Entry.search
  # itself over the same rows rather than against a hand-written expectation.
  test "query semantics are search's: stemming, phrases and exclusions" do
    studies = entry_in(@high, title: "Field notes", content: "<p>One study of quokka diets.</p>")
    phrase = entry_in(@high, title: "Island life", content: "<p>A happy quokka smiled.</p>")
    split = entry_in(@high, title: "Happy island", content: "<p>The quokka smiled.</p>")
    with_wombat = entry_in(@high, title: "Quokka and wombat", content: "<p>Neighbours.</p>")
    candidates = [ @in_high, @in_low, @unrelated, studies, phrase, split, with_wombat ]

    # An exclusion-only query is refused by TagRule's validation, so it is not here.
    [ "studies", '"happy quokka"', "quokka -wombat", "quokka or wombat" ].each do |query|
      rule = create_rule(query)
      expected = Entry.search(query).where(id: candidates.map(&:id)).pluck(:id).sort
      assert_not_empty expected, query

      assert_equal expected, rule.entry_tag_rule_matches.pluck(:entry_id).sort, query
      rule.destroy!
    end
  end

  test "the excluding search matches what Entry.search matches on a known case" do
    with_wombat = entry_in(@high, title: "Quokka and wombat", content: "<p>Neighbours.</p>")
    create_rule("quokka -wombat")

    assert_tagged @in_high, @in_low
    assert_not_tagged with_wombat
  end

  test "an arriving entry is tagged by the feed's rules" do
    create_rule("platypus", feed: @high)
    user_entry = subscribe(@user, @high, new_entry(title: "Platypus spotted", content: "<p>Rare.</p>"))

    TagRuleApplier.apply(user_entry)

    assert_tagged user_entry.entry
  end

  test "an arriving entry in another feed is left alone by a feed rule" do
    create_rule("platypus", feed: @low)
    user_entry = subscribe(@user, @high, new_entry(title: "Platypus spotted", content: "<p>Rare.</p>"))

    TagRuleApplier.apply(user_entry)

    assert_not_tagged user_entry.entry
  end

  test "a usable full text fetch re-evaluates the rules on the whole article" do
    create_rule("rezoning")
    entry = new_entry(title: "Council meeting", content: "<p>The council met.</p>",
                      link: "https://rules.example.com/council")
    subscribe(@user, @high, entry)
    assert_not_tagged entry

    stub_article(entry.link)
    assert EntryFullText.for(entry).usable?

    assert_tagged entry
  end

  test "a full text that adds an excluded word removes the rule's tag" do
    create_rule("council -rezoning")
    entry = new_entry(title: "Council meeting", content: "<p>The council met.</p>",
                      link: "https://rules.example.com/council")
    TagRuleApplier.apply(subscribe(@user, @high, entry))
    assert_tagged entry

    stub_article(entry.link)
    EntryFullText.for(entry)

    assert_not_tagged entry
  end

  test "a manual removal deletes the row and its matches" do
    rule = create_rule("quokka")

    EntryTag.remove(entry: @in_high, tag: @tag)

    assert_not_tagged @in_high
    assert_not rule.entry_tag_rule_matches.exists?(entry_id: @in_high.id)
  end

  test "a manually removed tag comes back when the rule next runs" do
    rule = create_rule("quokka")
    EntryTag.remove(entry: @in_high, tag: @tag)

    TagRuleApplier.sync(rule)

    assert_tagged @in_high
  end

  private

  def create_rule(query, feed: nil, category: nil)
    perform_enqueued_jobs do
      @tag.tag_rules.create!(user: @user, query: query, feed: feed, category: category)
    end
  end

  def assert_tagged(*entries)
    entries.each { |entry| assert EntryTag.exists?(entry: entry, tag: @tag), "#{entry.title} should carry #{@tag.name}" }
  end

  def assert_not_tagged(*entries)
    entries.each { |entry| assert_not EntryTag.exists?(entry: entry, tag: @tag), "#{entry.title} should not carry #{@tag.name}" }
  end

  def entry_in(feed, **attrs)
    entry = new_entry(**attrs)
    subscribe(feed.user, feed, entry)
    entry
  end

  def new_entry(title:, content:, link: "https://example.com/#{SecureRandom.hex(4)}")
    Entry.create!(
      guid: "rule-#{SecureRandom.uuid}", title: title, link: link, content: content,
      content_hash: SecureRandom.hex(16), updated: Time.current,
      date_entered: Time.current, date_updated: Time.current
    )
  end

  def subscribe(user, feed, entry)
    UserEntry.create!(uuid: SecureRandom.uuid, user: user, feed: feed, entry: entry, unread: true)
  end

  def stub_article(link)
    paragraphs = Array.new(4) { "<p>#{SENTENCE}</p>" }.join
    stub_request(:get, link).to_return(
      status: 200,
      body: "<html><body><article class='content'>#{paragraphs}</article></body></html>",
      headers: { "Content-Type" => "text/html" }
    )
  end
end
