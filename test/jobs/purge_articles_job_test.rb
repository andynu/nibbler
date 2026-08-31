require "test_helper"

class PurgeArticlesJobTest < ActiveSupport::TestCase
  # The purge removes orphaned entries with Relation#delete_all, which runs no
  # ActiveRecord callbacks, so Entry's dependent: :destroy declarations do
  # nothing on this path. Only the ON DELETE CASCADE on entry_summaries.entry_id
  # clears the summary.
  #
  # This is a catcher, not a guard. Drop the foreign_key: { on_delete: :cascade }
  # from the migration and this does not merely leave a stray row behind: the
  # DELETE violates the constraint and the job raises, taking the whole nightly
  # purge down with it. Verified by running it that way.
  test "purging an orphaned entry takes its summary with it" do
    orphan = Entry.create!(
      guid: "purge-orphan-with-summary",
      title: "Nobody subscribes to this",
      link: "https://example.com/orphan",
      content: "<p>Body</p>",
      content_hash: "orphan-hash",
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    )
    summary = EntrySummary.create!(
      entry: orphan,
      summary: "A summary that must not outlive its article.",
      content_hash: orphan.content_hash,
      model: "gemma4:e4b",
      generated_at: Time.current
    )

    assert_empty orphan.user_entries, "precondition: the entry is orphaned"

    PurgeArticlesJob.perform_now

    assert_not Entry.exists?(orphan.id), "precondition: the purge removed the entry"
    assert_not EntrySummary.exists?(summary.id)
  end

  # A summary belonging to an entry someone still subscribes to is left alone.
  # Without this, a cascade that fired too widely would pass the test above.
  test "a subscribed entry keeps its summary through a purge" do
    entry = entries(:basic)
    summary = EntrySummary.create!(
      entry: entry,
      summary: "A summary that should survive.",
      content_hash: entry.content_hash,
      model: "gemma4:e4b",
      generated_at: Time.current
    )

    assert_not_empty entry.user_entries, "precondition: the entry has a subscriber"

    PurgeArticlesJob.perform_now

    assert EntrySummary.exists?(summary.id)
  end
end
