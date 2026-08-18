require "test_helper"

class UpdateFaviconsJobTest < ActiveJob::TestCase
  setup do
    Feed.delete_all

    @user = users(:one)
    @feed = Feed.create!(
      user: @user,
      title: "Example",
      feed_url: "https://example.com/feed.rss",
      site_url: "https://example.com"
    )
    @written_icons = []
  end

  teardown do
    @written_icons.each { |path| File.delete(path) if File.exist?(path) }
  end

  test "enqueues a feed that has never been checked" do
    @feed.update!(favicon_last_checked: nil)

    assert_enqueued_with(job: FetchFaviconJob, args: [ @feed.id ]) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "enqueues a feed last checked before the refresh interval" do
    @feed.update!(
      favicon_last_checked: UpdateFaviconsJob::REFRESH_INTERVAL.ago - 1.day,
      icon_url: write_icon
    )

    assert_enqueued_with(job: FetchFaviconJob, args: [ @feed.id ]) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "skips a recently checked feed whose icon file is present" do
    @feed.update!(favicon_last_checked: 1.hour.ago, icon_url: write_icon)

    assert_no_enqueued_jobs(only: FetchFaviconJob) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "enqueues a recently checked feed whose icon file is missing" do
    @feed.update!(favicon_last_checked: 1.hour.ago, icon_url: icon_url_for("gone"))

    assert_enqueued_with(job: FetchFaviconJob, args: [ @feed.id ]) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "skips a recently checked feed that has no icon_url yet" do
    @feed.update!(favicon_last_checked: 1.hour.ago, icon_url: "")

    assert_no_enqueued_jobs(only: FetchFaviconJob) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "skips feeds with a custom favicon even when the file is missing" do
    @feed.update!(
      favicon_last_checked: 1.hour.ago,
      favicon_is_custom: true,
      icon_url: icon_url_for("gone")
    )

    assert_no_enqueued_jobs(only: FetchFaviconJob) do
      UpdateFaviconsJob.perform_now
    end
  end

  test "skips feeds without a site_url to fetch from" do
    @feed.update!(favicon_last_checked: nil, site_url: "")

    assert_no_enqueued_jobs(only: FetchFaviconJob) do
      UpdateFaviconsJob.perform_now
    end
  end

  private

  # Unique per call so parallel test workers never contend for the same path.
  def icon_url_for(suffix)
    "/icons/test-#{SecureRandom.hex(8)}-#{suffix}.png"
  end

  # Creates an icon file on disk and returns the icon_url pointing at it.
  def write_icon
    url = icon_url_for("present")
    path = FetchFaviconJob::ICONS_DIR.join(File.basename(url))
    FileUtils.mkdir_p(FetchFaviconJob::ICONS_DIR)
    File.binwrite(path, "icon")
    @written_icons << path
    url
  end
end
