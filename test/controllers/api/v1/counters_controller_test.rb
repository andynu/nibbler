require "test_helper"

class Api::V1::CountersControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = sign_in(User.first)
    @feed = feeds(:high_frequency)
  end

  def create_user_entry(title, updated:, unread: true, date_entered: nil)
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

    @user.user_entries.create!(entry: entry, feed: @feed, uuid: SecureRandom.uuid, unread: unread)
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
      counted = fresh_count(fresh_max_age: max_age)
      assert counted.positive?, "no fresh articles for fresh_max_age=#{max_age}, the comparison would be vacuous"

      get api_v1_entries_url, params: { view: "fresh", fresh_max_age: max_age }, as: :json
      assert_response :success
      listed = JSON.parse(response.body)["pagination"]["total"]

      get headlines_api_v1_entries_url, params: { view: "fresh", fresh_max_age: max_age }, as: :json
      assert_response :success
      headlined = JSON.parse(response.body)["pagination"]["total"]

      assert_equal counted, listed, "counters and entries disagree for fresh_max_age=#{max_age}"
      assert_equal counted, headlined, "counters and headlines disagree for fresh_max_age=#{max_age}"
    end
  end
end
