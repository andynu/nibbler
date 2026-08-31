require "test_helper"

# The fetch here is stubbed by WebMock, which test_helper puts in front of every
# outbound connection; an unstubbed host raises rather than being reached.
class EntryFullTextTest < ActiveSupport::TestCase
  PROSE = "The council voted 5-2 to reject the rezoning, ending a two-year fight over " \
          "the parcel on Fourth Street, which neighbours had opposed since 2024.".freeze

  SECOND = "Members said the traffic study, filed in March, understated peak volumes by " \
           "roughly a third, and asked the applicant to redo it before refiling.".freeze

  PAGE = "<html><body><div class='content'><p>#{PROSE}</p><p>#{SECOND}</p><p>#{PROSE}</p></div></body></html>".freeze

  setup do
    @entry = entries(:basic)
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new
  end

  teardown do
    Rails.cache = @original_cache
  end

  def stub_page(body: PAGE, status: 200)
    stub_request(:get, @entry.link)
      .to_return(status: status, body: body, headers: { "Content-Type" => "text/html" })
  end

  def build_record(**attributes)
    @entry.create_entry_full_text!({
      status: EntryFullText::OK,
      content: "<p>#{PROSE}</p>",
      char_count: PROSE.length,
      content_hash: @entry.content_hash,
      fetched_at: Time.current
    }.merge(attributes))
  end

  # =========
  # Freshness
  # =========

  test "is stale once the feed republishes the article" do
    record = build_record

    assert_not record.stale?

    @entry.update!(content_hash: "changed")
    assert record.reload.stale?
  end

  test "is usable when it holds current fetched text" do
    assert build_record.usable?
  end

  test "is not usable when the fetch failed" do
    assert_not build_record(status: EntryFullText::FAILED, content: "", char_count: 0).usable?
  end

  test "is not usable once it is stale" do
    record = build_record
    @entry.update!(content_hash: "changed")

    assert_not record.reload.usable?
  end

  # ==============
  # Retry window
  # ==============

  test "a current success is not refetched" do
    assert_not build_record.refetchable?
  end

  test "a stale success is refetched" do
    record = build_record
    @entry.update!(content_hash: "changed")

    assert record.reload.refetchable?
  end

  # This is the whole reason a failure is stored as a row. Without it, every open
  # of an article whose publisher refuses us goes back and asks again.
  test "a recent failure is not refetched" do
    record = build_record(status: EntryFullText::FAILED, content: "", char_count: 0, fetched_at: 1.hour.ago)

    assert_not record.refetchable?
  end

  test "a failure past the retry window is refetched" do
    record = build_record(
      status: EntryFullText::FAILED, content: "", char_count: 0,
      fetched_at: EntryFullText::RETRY_AFTER.ago - 1.minute
    )

    assert record.refetchable?
  end

  # ===========
  # .for(entry)
  # ===========

  test "fetches and stores the article when there is none" do
    stub_page

    record = EntryFullText.for(@entry)

    assert record.ok?
    assert_includes record.content, "voted 5-2"
    assert_operator record.char_count, :>, EntryFullText::MIN_TEXT_CHARS
    assert_equal @entry.content_hash, record.content_hash
    assert_requested :get, @entry.link
  end

  test "returns the stored article without asking the publisher again" do
    build_record

    record = EntryFullText.for(@entry)

    assert record.ok?
    assert_not_requested :get, @entry.link
  end

  test "stores a failure row when the publisher refuses" do
    stub_page(status: 403, body: "no")

    record = EntryFullText.for(@entry)

    assert record.failed?
    assert_equal "", record.content
    assert_equal 0, record.char_count
    assert_includes record.failure_detail, "403"
  end

  test "does not ask again while a recent failure stands" do
    build_record(status: EntryFullText::FAILED, content: "", char_count: 0, fetched_at: 10.minutes.ago)

    record = EntryFullText.for(@entry)

    assert record.failed?
    assert_not_requested :get, @entry.link
  end

  test "asks again once the retry window has passed" do
    build_record(
      status: EntryFullText::FAILED, content: "", char_count: 0,
      fetched_at: EntryFullText::RETRY_AFTER.ago - 1.minute
    )
    stub_page

    record = EntryFullText.for(@entry)

    assert record.ok?
    assert_requested :get, @entry.link
  end

  # Not a paywall detector: it asks only whether the fetch produced more article
  # than the feed already gave us, which is the whole reason for doing it.
  test "records a failure when the page yields no more than the feed already had" do
    @entry.update!(content: "<p>#{PROSE}</p><p>#{SECOND}</p><p>#{PROSE}</p><p>#{SECOND}</p>")
    stub_page(body: "<html><body><div class='content'><p>#{PROSE}</p></div></body></html>")

    record = EntryFullText.for(@entry)

    assert record.failed?
    assert_includes record.failure_detail, "no more than"
  end

  test "records a failure when the extraction is too short to be an article" do
    stub_page(body: "<html><body><div class='content'><p>Short. Nothing here at all really.</p></div></body></html>")

    record = EntryFullText.for(@entry)

    assert record.failed?
  end

  test "replaces the previous answer in place rather than accumulating rows" do
    build_record(status: EntryFullText::FAILED, content: "", char_count: 0, fetched_at: 1.day.ago)
    stub_page

    assert_no_difference -> { EntryFullText.count } do
      EntryFullText.for(@entry)
    end
  end

  # ========
  # Purging
  # ========

  test "goes away with the entry" do
    build_record

    assert_difference -> { EntryFullText.count }, -1 do
      @entry.destroy!
    end
  end

  # PurgeArticlesJob deletes orphaned entries with Relation#delete_all, which
  # instantiates nothing, so dependent: :destroy never runs on that path. The
  # database-level cascade is what covers it.
  test "goes away with the entry even when nothing is instantiated" do
    build_record

    assert_difference -> { EntryFullText.count }, -1 do
      Entry.where(id: @entry.id).delete_all
    end
  end

  # =====================
  # Entry#readable_content
  # =====================

  test "Entry#readable_content prefers the fetched article" do
    build_record

    assert_includes @entry.reload.readable_content, "voted 5-2"
  end

  test "Entry#readable_content falls back to the feed's own body" do
    assert_equal @entry.content, @entry.readable_content
  end

  test "Entry#readable_content falls back when the fetch failed" do
    build_record(status: EntryFullText::FAILED, content: "", char_count: 0)

    assert_equal @entry.content, @entry.reload.readable_content
  end

  test "Entry#readable_content falls back once the fetched copy is stale" do
    build_record
    @entry.update!(content_hash: "changed")

    assert_equal @entry.content, @entry.reload.readable_content
  end
end
