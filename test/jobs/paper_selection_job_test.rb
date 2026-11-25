require "test_helper"

class PaperSelectionJobTest < ActiveJob::TestCase
  setup do
    freeze_time
    @user = users(:one)
    @tag = @user.tags.create!(name: "ruby", include_in_paper: true, paper_limit: 5)
    @row = candidate(entered: 10.days.ago)
  end

  test "uses PaperSelection::WINDOW by default" do
    result = PaperSelectionJob.perform_now.sole

    assert_equal 0, result.candidates
    assert_not @row.reload.published
  end

  test "window_days widens the window and accepts the string an env var gives" do
    result = PaperSelectionJob.perform_now(window_days: "14").sole

    assert_equal [ @row ], result.published
    assert @row.reload.published
  end

  test "logs candidates and published ids per tag" do
    log = StringIO.new
    previous = Rails.logger
    Rails.logger = ActiveSupport::Logger.new(log)

    PaperSelectionJob.perform_now(window_days: 14)

    assert_includes log.string, %([PaperSelectionJob] user #{@user.id} tag "ruby": 1 candidates, published [#{@row.id}])
  ensure
    Rails.logger = previous
  end

  private

  def candidate(entered:)
    entry = Entry.create!(
      guid: "paper-job-entry", title: "Long read", link: "https://example.com/long-read",
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
