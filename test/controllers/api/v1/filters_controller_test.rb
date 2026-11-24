require "test_helper"

class Api::V1::FiltersControllerTest < ActionDispatch::IntegrationTest
  def setup
    @user = sign_in(users(:one))
    @feed = feeds(:high_frequency)
    @entry = Entry.create!(
      guid: "filters-controller-#{SecureRandom.uuid}",
      title: "Filters controller article",
      link: "https://example.com/#{SecureRandom.hex(4)}",
      content: "<p>Only the excerpt.</p>",
      content_hash: SecureRandom.hex(8),
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current,
      word_count: 3000,
      link_density: 1.0
    )
    @user_entry = UserEntry.create!(
      uuid: SecureRandom.uuid,
      user: @user,
      feed: @feed,
      entry: @entry,
      unread: true,
      marked: false,
      published: false,
      score: 0
    )
    @filter = Filter.create!(user: @user, title: "Long reads #{SecureRandom.hex(4)}", enabled: true)
  end

  test "test action matches metric rules against stored metrics" do
    FilterRule.create!(filter: @filter, filter_type: "word_count", reg_exp: ">=2500")
    FilterRule.create!(filter: @filter, filter_type: "link_density", reg_exp: "<3")

    post test_api_v1_filter_path(@filter), as: :json

    assert_response :success
    matched_ids = response.parsed_body["matched_articles"].map { |a| a["id"] }
    assert_includes matched_ids, @entry.id
  end

  test "backfill matches content rules against the usable full text" do
    @entry.create_entry_full_text!(
      status: EntryFullText::OK,
      content: "<p>The full article discusses zymurgy at length.</p>",
      char_count: 45,
      content_hash: @entry.content_hash,
      fetched_at: Time.current
    )
    FilterRule.create!(filter: @filter, filter_type: "content", reg_exp: "zymurgy", feed: @feed)
    FilterAction.create!(filter: @filter, action_type: "mark_read", action_param: "")

    post backfill_api_v1_filter_path(@filter), as: :json

    assert_response :success
    assert_equal false, @user_entry.reload.unread
  end
end
