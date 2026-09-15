require "test_helper"

class EntrySummaryTest < ActiveSupport::TestCase
  setup do
    @entry = entries(:basic)
  end

  # No readable_content_hash: the shape of a row written before that column
  # existed, which the tests down to the next divider exercise.
  def build_summary(entry: @entry, **overrides)
    EntrySummary.new({
      entry: entry,
      summary: "A short account of the article.",
      content_hash: entry.content_hash,
      model: "gemma4:e4b",
      generated_at: Time.current
    }.merge(overrides))
  end

  test "valid_for_content? is true while the entry still carries the hash the summary was written against" do
    assert build_summary.valid_for_content?
  end

  # The invalidation test. Only the entry's content_hash moves; the summary row
  # is untouched. An implementation that compares the summary to itself, or that
  # answers a constant, fails here.
  test "valid_for_content? is false once the entry's content_hash changes" do
    summary = build_summary
    assert summary.valid_for_content?, "precondition: summary starts current"

    @entry.update!(content_hash: "a-different-hash")

    assert_not summary.valid_for_content?
  end

  test "stale? reports the article moved on after the summary was written" do
    summary = build_summary
    assert_not summary.stale?

    @entry.update!(content_hash: "a-different-hash")

    assert summary.stale?
  end

  # Andy's decision (bd ttrb-h4oq, 2026-08-30) overriding the ticket's own
  # acceptance criteria: a summary whose hash no longer matches is SHOWN, marked
  # stale, with a regenerate control. It is not hidden and not silently dropped.
  #
  # This is a regression fence, not a bug catcher: nothing in EntrySummary today
  # could null out a stale summary, so it cannot fail against the current
  # implementation. It exists because the ticket text still says the opposite,
  # and the sibling audio path (Api::V1::EntriesController#audio) really does
  # destroy its stale cache on read, so "make summaries behave like audio" is a
  # plausible future change that this would catch.
  test "a stale summary survives the staleness check with its text intact" do
    summary = build_summary
    summary.save!
    @entry.update!(content_hash: "a-different-hash")

    reloaded = @entry.reload.entry_summary

    assert_not_nil reloaded, "a stale summary must still be reachable from the entry"
    assert reloaded.stale?
    assert_equal "A short account of the article.", reloaded.summary
    assert_equal "gemma4:e4b", reloaded.model
  end

  test "the summary records which model wrote it and when" do
    generated_at = 3.hours.ago
    summary = build_summary(model: "mistral-small3.2", generated_at: generated_at)
    summary.save!

    reloaded = EntrySummary.find(summary.id)

    assert_equal "mistral-small3.2", reloaded.model
    assert_in_delta generated_at, reloaded.generated_at, 1.second
  end

  test "summary, content_hash, model and generated_at are all required" do
    %i[summary content_hash model generated_at].each do |attribute|
      record = build_summary(attribute => nil)

      assert_not record.valid?, "expected a missing #{attribute} to be invalid"
      assert_includes record.errors.attribute_names, attribute
    end
  end

  test "an entry holds at most one summary" do
    build_summary.save!

    assert_raises ActiveRecord::RecordNotUnique do
      build_summary(summary: "A second, competing account.").save!
    end
  end

  # Asserts the outcome the ticket asks for. Note it does NOT isolate
  # dependent: :destroy: entry_summaries.entry_id is declared ON DELETE CASCADE,
  # so removing the association option leaves this passing. The two paths are
  # indistinguishable from outside because EntrySummary has no destroy callbacks
  # of its own (unlike CachedAudio, which deletes a file). Both are wanted, and
  # the cascade is the one that also covers PurgeArticlesJob's delete_all --
  # see PurgeArticlesJobTest.
  test "destroying an entry destroys its summary" do
    summary = build_summary
    summary.save!

    assert_difference -> { EntrySummary.count }, -1 do
      @entry.destroy
    end

    assert_not EntrySummary.exists?(summary.id)
  end

  # The point of hanging summaries off Entry rather than UserEntry: the entry is
  # shared, so a summary one reader paid for is read by every other subscriber.
  # Move the association to UserEntry and this fails, because the second
  # subscriber's row would carry no summary.
  test "one summary serves every user subscribed to the entry" do
    build_summary.save!
    second_subscriber = UserEntry.create!(
      uuid: "ue-second-subscriber",
      user: users(:two),
      feed: feeds(:high_frequency),
      entry: @entry
    )

    subscribers = [ user_entries(:basic_entry), second_subscriber ]

    assert_equal 2, subscribers.map(&:user_id).uniq.length, "precondition: two different readers"

    summaries = subscribers.map { |user_entry| user_entry.entry.entry_summary }

    assert summaries.none?(&:nil?), "every subscriber reaches the summary"
    assert_equal 1, summaries.map(&:id).uniq.length, "and it is the same row, generated once"
  end

  # --- summaries stamped with the text they were written from ---------------

  EXCERPT_PLUS = "<p>Hello World, and the four paragraphs the feed left out.</p>".freeze

  def build_current_summary(entry: @entry)
    build_summary(entry: entry, readable_content_hash: EntrySummary.readable_content_hash_for(entry))
  end

  def store_full_text(content, entry: @entry)
    entry.create_entry_full_text!(
      status: EntryFullText::OK,
      content: content,
      char_count: ArticleText.from_html(content).length,
      content_hash: entry.content_hash,
      fetched_at: Time.current
    )
  end

  # The case entries.content_hash cannot see: fetching leaves the entry's hash
  # where it was and changes only what Entry#readable_content returns.
  test "a summary of the excerpt goes stale when a longer copy of the article is fetched" do
    summary = build_current_summary
    summary.save!
    hash_before = @entry.content_hash
    assert_not EntrySummary.find(summary.id).stale?, "precondition: summary starts current"

    store_full_text(EXCERPT_PLUS)

    assert_equal hash_before, @entry.reload.content_hash, "precondition: fetching does not move the entry's hash"
    assert EntrySummary.find(summary.id).stale?
  end

  test "a summary of the fetched copy goes stale when a refetch brings different text" do
    full_text = store_full_text("<p>The publisher's copy as first fetched.</p>")
    summary = build_current_summary
    summary.save!
    assert_equal CachedAudio.hash_content(full_text.content), summary.readable_content_hash,
      "precondition: written from the fetched copy"

    @entry.update!(content: "<p>Hello World, edited.</p>", content_hash: "an-edited-hash")
    assert EntrySummary.find(summary.id).stale?, "a republish leaves the fetched copy unusable"

    full_text.update!(content: "<p>The publisher's copy after the edit.</p>", content_hash: "an-edited-hash")

    assert EntrySummary.find(summary.id).stale?
  end

  test "a refetch that brings back the same text leaves a summary of it current" do
    full_text = store_full_text("<p>The publisher's copy.</p>")
    summary = build_current_summary
    summary.save!

    @entry.update!(content: "<p>Hello World, edited.</p>", content_hash: "an-edited-hash")
    full_text.update!(content_hash: "an-edited-hash", fetched_at: Time.current)

    assert_not EntrySummary.find(summary.id).stale?
  end

  test "an edit that changes only markup leaves a summary current" do
    summary = build_current_summary
    summary.save!

    @entry.update!(content: "<div>Hello World</div>", content_hash: "a-markup-only-edit")

    assert_not EntrySummary.find(summary.id).stale?
  end

  test "a summary with no readable_content_hash keeps comparing the entry's content_hash" do
    summary = build_summary
    summary.save!

    store_full_text(EXCERPT_PLUS)
    assert_not EntrySummary.find(summary.id).stale?, "a fetch does not stale a row with no digest, as before"

    @entry.update!(content_hash: "a-different-hash")
    assert EntrySummary.find(summary.id).stale?
  end
end
