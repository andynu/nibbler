require "test_helper"

class Api::V1::CountersControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = sign_in(User.first)
    @feed = feeds(:high_frequency)
  end

  def create_user_entry(title, updated:, unread: true, date_entered: nil, feed: nil, user: nil)
    entry = Entry.create!(
      guid: "counter-entry-#{SecureRandom.uuid}",
      title: title,
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: "<p>Content</p>",
      content_hash: SecureRandom.hex(8),
      updated: updated,
      date_entered: date_entered || updated,
      date_updated: Time.current
    )

    (user || @user).user_entries.create!(entry: entry, feed: feed || @feed, uuid: SecureRandom.uuid, unread: unread)
  end

  def fresh_totals(params)
    counted = fresh_count(params)

    get api_v1_entries_url, params: params.merge(view: "fresh"), as: :json
    assert_response :success
    listed = JSON.parse(response.body)["pagination"]["total"]

    get headlines_api_v1_entries_url, params: params.merge(view: "fresh"), as: :json
    assert_response :success
    headlined = JSON.parse(response.body)["pagination"]["total"]

    { counted: counted, listed: listed, headlined: headlined }
  end

  def fresh_count(params = {})
    get api_v1_counters_url, params: params, as: :json
    assert_response :success
    JSON.parse(response.body)["virtual"]["fresh"]
  end

  test "fresh count excludes articles that have already been read" do
    baseline = fresh_count

    create_user_entry("Read Recent", updated: 1.hour.ago, unread: false)
    assert_equal baseline, fresh_count, "read articles must not raise the Fresh count"

    create_user_entry("Unread Recent", updated: 1.hour.ago, unread: true)
    assert_equal baseline + 1, fresh_count
  end

  test "fresh count uses publication date not import date" do
    baseline = fresh_count

    # Published two months ago, imported a minute ago
    create_user_entry("Backlog Import", updated: 2.months.ago, date_entered: 1.minute.ago)

    assert_equal baseline, fresh_count, "a recent import of an old article is not fresh"
  end

  test "fresh count honours the fresh_max_age param" do
    create_user_entry("Two Weeks Old", updated: 2.weeks.ago)

    week = fresh_count(fresh_max_age: "week")
    month = fresh_count(fresh_max_age: "month")

    assert_equal week + 1, month, "the month window must include the two week old article"
  end

  test "fresh count matches what the entries and headlines endpoints list" do
    create_user_entry("Fresh Unread", updated: 1.hour.ago)
    create_user_entry("Fresh Read", updated: 1.hour.ago, unread: false)
    create_user_entry("Old Unread", updated: 2.months.ago, date_entered: 1.minute.ago)
    create_user_entry("Two Weeks Unread", updated: 2.weeks.ago)

    %w[week month].each do |max_age|
      totals = fresh_totals(fresh_max_age: max_age)
      assert totals[:counted].positive?, "no fresh articles for fresh_max_age=#{max_age}, the comparison would be vacuous"

      assert_equal totals[:counted], totals[:listed], "counters and entries disagree for fresh_max_age=#{max_age}"
      assert_equal totals[:counted], totals[:headlined], "counters and headlines disagree for fresh_max_age=#{max_age}"
    end
  end

  test "fresh count applies the per-feed cap the Fresh list applies" do
    user = sign_in(users(:two))
    feed_a = user.feeds.create!(title: "Feed A", feed_url: "https://example.com/a.rss")
    feed_b = user.feeds.create!(title: "Feed B", feed_url: "https://example.com/b.rss")

    4.times { |i| create_user_entry("A#{i}", updated: (i + 1).hours.ago, feed: feed_a, user: user) }
    create_user_entry("B0", updated: 1.hour.ago, feed: feed_b, user: user)

    assert_equal 5, fresh_count(fresh_max_age: "week")

    # Feed A gives up two of its four, feed B has fewer than the cap and keeps its one.
    assert_equal 3, fresh_count(fresh_max_age: "week", fresh_per_feed: 2)

    # Non-positive and absent caps mean no cap at all, matching the list's "∞".
    assert_equal 5, fresh_count(fresh_max_age: "week", fresh_per_feed: 0)
  end

  test "fresh count matches entries and headlines when a per-feed cap is applied" do
    other_feed = @user.feeds.create!(title: "Second Feed", feed_url: "https://example.com/second.rss")

    3.times { |i| create_user_entry("First #{i}", updated: (i + 1).hours.ago) }
    3.times { |i| create_user_entry("Second #{i}", updated: (i + 1).hours.ago, feed: other_feed) }

    uncapped = fresh_count(fresh_max_age: "week")

    [ 1, 2 ].each do |per_feed|
      totals = fresh_totals(fresh_max_age: "week", fresh_per_feed: per_feed)
      assert totals[:counted] < uncapped, "a cap of #{per_feed} per feed must drop rows the uncapped count includes"

      assert_equal totals[:counted], totals[:listed], "counters and entries disagree for fresh_per_feed=#{per_feed}"
      assert_equal totals[:counted], totals[:headlined], "counters and headlines disagree for fresh_per_feed=#{per_feed}"
    end
  end
end
