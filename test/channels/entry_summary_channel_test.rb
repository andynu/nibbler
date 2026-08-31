require "test_helper"

class EntrySummaryChannelTest < ActionCable::Channel::TestCase
  setup do
    @user_entry = user_entries(:basic_entry)
    @entry = @user_entry.entry
    @reader = @user_entry.user
    @stranger = User.where.not(id: @reader.id).first
  end

  test "subscribes a reader of the entry to that entry's stream" do
    stub_connection current_user: @reader

    subscribe entry_id: @entry.id

    assert subscription.confirmed?
    assert_has_stream "entry_summary:#{@entry.id}"
  end

  # The whole point of keying on the entry: one generation, every reader of that
  # article watching it. If the two readers landed on different streams the
  # summary would have to be generated twice to reach them both.
  test "two readers of the same entry share one stream" do
    @stranger.user_entries.create!(
      entry: @entry, feed: @user_entry.feed, uuid: SecureRandom.uuid, unread: true
    )

    stub_connection current_user: @stranger
    subscribe entry_id: @entry.id

    assert subscription.confirmed?
    assert_has_stream "entry_summary:#{@entry.id}"
  end

  # An entry id is a small integer a client picks, so without this check the
  # channel is a way to read the summary of any article in the database.
  test "rejects a subscriber with no UserEntry for the entry" do
    stub_connection current_user: @stranger

    subscribe entry_id: @entry.id

    assert subscription.rejected?
    assert_no_streams
  end

  test "rejects an entry id that does not exist" do
    stub_connection current_user: @reader

    subscribe entry_id: Entry.maximum(:id).to_i + 1

    assert subscription.rejected?
    assert_no_streams
  end

  test "rejects a subscription with no entry id" do
    stub_connection current_user: @reader

    subscribe

    assert subscription.rejected?
    assert_no_streams
  end

  # params arrive as whatever JSON the client sent. A non-numeric id has to be
  # refused rather than reach the database or interpolate into a stream name.
  test "rejects a non-numeric entry id" do
    stub_connection current_user: @reader

    subscribe entry_id: "1 OR 1=1"

    assert subscription.rejected?
    assert_no_streams
  end

  # JSON does not distinguish 12 from "12", and the broadcasting side always has
  # an Integer. The two have to name the same stream or nothing is delivered.
  test "stream_name_for coerces the id so a string subscriber and an integer broadcaster meet" do
    assert_equal "entry_summary:12", EntrySummaryChannel.stream_name_for(12)
    assert_equal "entry_summary:12", EntrySummaryChannel.stream_name_for("12")
  end

  test "summary_payload carries the text, the model that wrote it, and whether it is stale" do
    summary = EntrySummary.create!(
      entry: @entry,
      summary: "A paragraph.",
      model: "gemma4:e4b",
      content_hash: @entry.content_hash,
      generated_at: Time.current
    )

    payload = EntrySummaryChannel.summary_payload(summary)

    assert_equal "A paragraph.", payload[:summary]
    assert_equal "gemma4:e4b", payload[:model]
    assert_equal summary.generated_at, payload[:generated_at]
    assert_equal false, payload[:stale]
  end

  # The client never sees a content_hash, so staleness is not something it can
  # work out for itself. Sending the flag is the only way it can label a summary
  # as describing an earlier version of the article.
  test "summary_payload reports a summary written against superseded text as stale" do
    summary = EntrySummary.create!(
      entry: @entry,
      summary: "A paragraph about the old text.",
      model: "gemma4:e4b",
      content_hash: "a-hash-the-entry-no-longer-has",
      generated_at: Time.current
    )

    assert_equal true, EntrySummaryChannel.summary_payload(summary)[:stale]
  end

  test "summary_payload of nothing is nothing" do
    assert_nil EntrySummaryChannel.summary_payload(nil)
  end
end
