require "test_helper"

class EntrySummaryTest < ActiveSupport::TestCase
  setup do
    @entry = entries(:basic)
  end

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
end
