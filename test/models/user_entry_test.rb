require "test_helper"

class UserEntryTest < ActiveSupport::TestCase
  include ActiveJob::TestHelper

  test "publish! sets published and last_published" do
    user_entry = user_entries(:basic_entry)
    freeze_time

    user_entry.publish!

    user_entry.reload
    assert user_entry.published
    assert_equal Time.current, user_entry.last_published
  end

  test "publish! on an already published entry keeps last_published" do
    user_entry = user_entries(:basic_entry)
    original = 1.day.ago.change(usec: 0)
    user_entry.update!(published: true, last_published: original)

    user_entry.publish!

    user_entry.reload
    assert user_entry.published
    assert_equal original, user_entry.last_published
  end

  test "toggle_published! publishes with last_published" do
    user_entry = user_entries(:basic_entry)
    freeze_time

    user_entry.toggle_published!

    user_entry.reload
    assert user_entry.published
    assert_equal Time.current, user_entry.last_published
  end

  test "toggle_published! unpublishes and clears last_published" do
    user_entry = user_entries(:basic_entry)
    user_entry.update!(published: true, last_published: 1.day.ago)

    user_entry.toggle_published!

    user_entry.reload
    assert_not user_entry.published
    assert_nil user_entry.last_published
  end

  test "publishing enqueues FetchFullTextJob when no usable full text" do
    user_entry = user_entries(:basic_entry)

    assert_enqueued_with(job: FetchFullTextJob, args: [ user_entry.entry_id ]) do
      user_entry.publish!
    end
  end

  test "publishing enqueues FetchFullTextJob when the full text is stale" do
    user_entry = user_entries(:basic_entry)
    create_full_text(user_entry.entry, content_hash: "superseded")

    assert_enqueued_with(job: FetchFullTextJob, args: [ user_entry.entry_id ]) do
      user_entry.publish!
    end
  end

  test "publishing does not enqueue when full text is usable" do
    user_entry = user_entries(:basic_entry)
    create_full_text(user_entry.entry, content_hash: user_entry.entry.content_hash)

    assert_no_enqueued_jobs(only: FetchFullTextJob) do
      user_entry.publish!
    end
  end

  test "unpublishing does not enqueue" do
    user_entry = user_entries(:basic_entry)
    user_entry.update_columns(published: true, last_published: 1.day.ago)

    assert_no_enqueued_jobs(only: FetchFullTextJob) do
      user_entry.toggle_published!
    end
  end

  test "publish! on an already published entry does not enqueue" do
    user_entry = user_entries(:basic_entry)
    user_entry.update_columns(published: true, last_published: 1.day.ago)

    assert_no_enqueued_jobs(only: FetchFullTextJob) do
      user_entry.publish!
    end
  end

  test "saving a published entry without changing published does not enqueue" do
    user_entry = user_entries(:basic_entry)
    user_entry.update_columns(published: true, last_published: 1.day.ago)

    assert_no_enqueued_jobs(only: FetchFullTextJob) do
      user_entry.mark_read!
    end
  end

  private

  def create_full_text(entry, content_hash:)
    entry.create_entry_full_text!(
      status: EntryFullText::OK,
      content: "<p>The full article.</p>",
      char_count: 17,
      content_hash: content_hash,
      fetched_at: Time.current
    )
  end
end
