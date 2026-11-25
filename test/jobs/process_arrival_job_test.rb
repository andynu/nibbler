require "test_helper"
require "minitest/mock"

# The full-text fetch is stubbed by WebMock, which test_helper puts in front of
# every outbound connection; an unstubbed host raises rather than being reached.
class ProcessArrivalJobTest < ActiveJob::TestCase
  SENTENCE = "The council voted to reject the rezoning, ending a long fight over the " \
             "parcel on Fourth Street, which the neighbours had opposed for years now.".freeze

  setup do
    @original_cache = Rails.cache
    Rails.cache = ActiveSupport::Cache::MemoryStore.new

    @user = users(:one)
    @feed = feeds(:high_frequency)
    @entry = Entry.create!(
      guid: "arrival-#{SecureRandom.uuid}",
      title: "Rezoning Rejected",
      link: "https://arrival.example.com/rezoning",
      content: "<p>The council voted on the rezoning.</p>",
      content_hash: SecureRandom.hex(16),
      date_entered: Time.current,
      date_updated: Time.current,
      updated: Time.current
    )
    ArticleMetrics.refresh!(@entry)
    @user_entry = UserEntry.create!(
      uuid: SecureRandom.uuid,
      user: @user,
      feed: @feed,
      entry: @entry,
      unread: true,
      published: false
    )
  end

  teardown do
    Rails.cache = @original_cache
  end

  test "a long article fetched on arrival is published by a word count filter" do
    stub_article(words: 3000)
    publish_filter_for(filter_type: "word_count", reg_exp: ">=2500")

    ProcessArrivalJob.perform_now(@user_entry.id)

    assert_operator @entry.reload.word_count, :>=, 2500
    assert @user_entry.reload.published, "the filter should see the fetched article, not the excerpt"
  end

  test "filters still run on the excerpt when the fetch raises" do
    tag_filter_for(filter_type: "title", reg_exp: "Rezoning", tag: "council")

    EntryFullText.stub(:for, ->(_entry) { raise Timeout::Error, "worker killed" }) do
      ProcessArrivalJob.perform_now(@user_entry.id)
    end

    assert_includes @entry.reload.tags.pluck(:name), "council"
  end

  test "a feed tag without a rule no longer tags the article" do
    stub_article(words: 3000)
    tag = @user.tags.create!(name: "council", bg_color: "#64748b", fg_color: "#ffffff")
    @feed.tags << tag

    ProcessArrivalJob.perform_now(@user_entry.id)

    assert_not_includes @entry.reload.tags, tag
  end

  test "applies the reader's tag rules to the fetched article" do
    stub_article(words: 3000)
    tag = @user.tags.create!(name: "parcel")
    tag.tag_rules.create!(user: @user, query: "\"fourth street\"", feed: @feed)

    ProcessArrivalJob.perform_now(@user_entry.id)

    assert_includes @entry.reload.tags, tag
  end

  test "discards the job when the user entry no longer exists" do
    called = false

    EntryFullText.stub(:for, ->(_entry) { called = true }) do
      assert_nothing_raised { ProcessArrivalJob.perform_now(-1) }
    end

    assert_not called
  end

  private

  def stub_article(words:)
    paragraphs = Array.new((words / SENTENCE.split.size) + 1) { "<p>#{SENTENCE}</p>" }.join
    stub_request(:get, @entry.link).to_return(
      status: 200,
      body: "<html><body><article class='content'>#{paragraphs}</article></body></html>",
      headers: { "Content-Type" => "text/html" }
    )
  end

  def publish_filter_for(filter_type:, reg_exp:)
    filter = new_filter
    FilterRule.create!(filter: filter, filter_type: filter_type, reg_exp: reg_exp)
    FilterAction.create!(filter: filter, action_type: "publish", action_param: "")
  end

  def tag_filter_for(filter_type:, reg_exp:, tag:)
    filter = new_filter
    FilterRule.create!(filter: filter, filter_type: filter_type, reg_exp: reg_exp)
    FilterAction.create!(filter: filter, action_type: "tag", action_param: tag)
  end

  def new_filter
    Filter.create!(user: @user, title: "Arrival", match_any_rule: false, inverse: false, order_id: 0, enabled: true)
  end
end
