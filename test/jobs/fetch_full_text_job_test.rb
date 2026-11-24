require "test_helper"
require "minitest/mock"

class FetchFullTextJobTest < ActiveJob::TestCase
  test "fetches the entry's full text through EntryFullText.for" do
    entry = entries(:basic)
    received = nil

    EntryFullText.stub(:for, ->(arg) { received = arg }) do
      FetchFullTextJob.perform_now(entry.id)
    end

    assert_equal entry, received
  end

  test "discards the job when the entry no longer exists" do
    called = false

    EntryFullText.stub(:for, ->(_arg) { called = true }) do
      assert_nothing_raised { FetchFullTextJob.perform_now(-1) }
    end

    assert_not called
  end
end
