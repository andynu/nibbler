require "test_helper"

class FetchFaviconJobTest < ActiveJob::TestCase
  setup do
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

  test "names the icon file after a digest of its bytes" do
    perform_with_icon(svg_bytes("red"))

    @feed.reload
    digest = Digest::SHA256.hexdigest(svg_bytes("red"))[0, 16]
    assert_equal "/icons/#{@feed.id}-#{digest}.svg", @feed.icon_url
    assert File.exist?(icon_path(@feed.icon_url))
    assert_equal svg_bytes("red"), File.binread(icon_path(@feed.icon_url))
  end

  test "changed favicon bytes produce a new URL so caches cannot serve the old image" do
    perform_with_icon(svg_bytes("red"))
    original_url = @feed.reload.icon_url

    perform_with_icon(svg_bytes("blue"))
    updated_url = @feed.reload.icon_url

    refute_equal original_url, updated_url
    assert File.exist?(icon_path(updated_url))
  end

  test "deletes the superseded icon file" do
    perform_with_icon(svg_bytes("red"))
    original_path = icon_path(@feed.reload.icon_url)

    perform_with_icon(svg_bytes("blue"))

    refute File.exist?(original_path)
  end

  test "unchanged favicon bytes keep the same URL" do
    perform_with_icon(svg_bytes("red"))
    original_url = @feed.reload.icon_url

    perform_with_icon(svg_bytes("red"))

    assert_equal original_url, @feed.reload.icon_url
    assert File.exist?(icon_path(original_url))
  end

  test "records the check time when no favicon is found" do
    @feed.update!(favicon_last_checked: nil)
    result = FaviconFetcher::FetchResult.new(status: :error, error: "No favicon found")

    FaviconFetcher.stub(:new, ->(_feed) { Minitest::Mock.new.expect(:fetch, result) }) do
      FetchFaviconJob.perform_now(@feed.id)
    end

    @feed.reload
    assert_predicate @feed.icon_url, :blank?
    assert_not_nil @feed.favicon_last_checked
  end

  test "leaves a custom favicon alone" do
    @feed.update!(favicon_is_custom: true, icon_url: "/icons/custom.png")

    FaviconFetcher.stub(:new, ->(_feed) { flunk("should not fetch for a custom favicon") }) do
      FetchFaviconJob.perform_now(@feed.id)
    end

    assert_equal "/icons/custom.png", @feed.reload.icon_url
  end

  private

  # SVG keeps FaviconColorCalculator from shelling out to MiniMagick, and the
  # random tag makes each worker's digests unique so parallel tests never share
  # a path under public/icons.
  def svg_bytes(variant)
    @svg_salt ||= SecureRandom.hex(8)
    %(<svg xmlns="http://www.w3.org/2000/svg" id="#{@svg_salt}-#{variant}"/>)
  end

  def perform_with_icon(image_data)
    result = FaviconFetcher::FetchResult.new(
      status: :ok,
      image_data: image_data,
      content_type: "image/svg+xml",
      source: "favicon_ico"
    )

    FaviconFetcher.stub(:new, ->(_feed) { Minitest::Mock.new.expect(:fetch, result) }) do
      FetchFaviconJob.perform_now(@feed.id)
    end

    @written_icons << icon_path(@feed.reload.icon_url)
  end

  def icon_path(icon_url)
    FetchFaviconJob::ICONS_DIR.join(File.basename(icon_url))
  end
end
