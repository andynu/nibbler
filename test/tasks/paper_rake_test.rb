require "test_helper"
require "rake"

class PaperRakeTest < ActiveSupport::TestCase
  setup do
    Rails.application.load_tasks unless Rake::Task.task_defined?("paper:select")
    Rake::Task["paper:select"].reenable
    freeze_time
    @user = users(:one)
    @tag = @user.tags.create!(name: "ruby", include_in_paper: true, paper_limit: 5)
  end

  test "publishes the picks and prints them per tag" do
    row = candidate(entered: 1.day.ago)

    output, = capture_io { Rake::Task["paper:select"].invoke }

    assert row.reload.published
    assert_includes output, "user #{@user.id} tag ruby: 1 candidates, 1 published"
    assert_includes output, "  Long read"
  end

  test "WINDOW_DAYS overrides the window" do
    row = candidate(entered: 10.days.ago)

    with_env("WINDOW_DAYS" => "14") do
      capture_io { Rake::Task["paper:select"].invoke }
    end

    assert row.reload.published
  end

  private

  def with_env(vars)
    previous = vars.keys.index_with { |key| ENV[key] }
    vars.each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end

  def candidate(entered:)
    entry = Entry.create!(
      guid: "paper-rake-entry", title: "Long read", link: "https://example.com/long-read",
      content: "<p>Excerpt</p>", content_hash: "hash-long-read",
      updated: entered, date_entered: entered, date_updated: entered,
      word_count: 2000, link_density: 1.0
    )
    EntryTag.add_manual(entry: entry, tag: @tag)
    entry.create_entry_full_text!(status: EntryFullText::OK, content: "<p>Article</p>",
      content_hash: entry.content_hash, fetched_at: Time.current)
    @user.user_entries.create!(entry: entry, feed: feeds(:high_frequency), uuid: SecureRandom.uuid)
  end
end
