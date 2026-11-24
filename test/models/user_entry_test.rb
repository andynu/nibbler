require "test_helper"

class UserEntryTest < ActiveSupport::TestCase
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
end
