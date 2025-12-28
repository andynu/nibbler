require "test_helper"

class ImageCacherTest < ActiveSupport::TestCase
  # Disable parallel execution for this test class
  # since it modifies shared fixture data (entries)
  parallelize(workers: 1)

  setup do
    @entry = entries(:with_images)
    @cache_dir = CachedImage::CACHE_DIR
    FileUtils.mkdir_p(@cache_dir)

    # Clear any existing cached images for this entry
    @entry.cached_images.destroy_all
    @entry.update!(cached_content: nil)

    # Stub image downloads
    stub_request(:get, "https://example.com/image1.jpg")
      .to_return(status: 200, body: fake_jpeg, headers: { "Content-Type" => "image/jpeg" })
    stub_request(:get, "https://example.com/image2.png")
      .to_return(status: 200, body: fake_png, headers: { "Content-Type" => "image/png" })
  end

  teardown do
    # Clean up test files and cached records
    @entry&.cached_images&.destroy_all
    FileUtils.rm_rf(@cache_dir)
  end

  test "extracts image URLs from content" do
    cacher = ImageCacher.new(@entry)
    urls = cacher.send(:extract_image_urls, @entry.content)

    assert_equal 2, urls.size
    assert_includes urls, "https://example.com/image1.jpg"
    assert_includes urls, "https://example.com/image2.png"
  end

  test "skips data URIs" do
    entry = Entry.new(content: '<img src="data:image/png;base64,abc123">')
    cacher = ImageCacher.new(entry)
    urls = cacher.send(:extract_image_urls, entry.content)

    assert_empty urls
  end

  test "cache_images downloads and stores images" do
    cacher = ImageCacher.new(@entry)
    result = cacher.cache_images

    assert result.success
    assert_equal 2, result.cached_count
    assert_equal 0, result.failed_count
    assert_equal 2, @entry.cached_images.count
  end

  test "cache_images updates cached_content with rewritten URLs" do
    cacher = ImageCacher.new(@entry)
    cacher.cache_images

    @entry.reload
    assert_not_nil @entry.cached_content
    assert_no_match %r{https://example\.com/image}, @entry.cached_content
    assert_match %r{/images/cache/}, @entry.cached_content
  end

  test "cache_images handles download failures gracefully" do
    stub_request(:get, "https://example.com/image1.jpg")
      .to_return(status: 404)

    cacher = ImageCacher.new(@entry)
    result = cacher.cache_images

    assert result.success
    assert_equal 1, result.cached_count  # image2.png
    assert_equal 1, result.failed_count  # image1.jpg
  end

  test "cache_images skips images larger than MAX_IMAGE_SIZE" do
    large_body = "x" * (ImageCacher::MAX_IMAGE_SIZE + 1)
    stub_request(:get, "https://example.com/image1.jpg")
      .to_return(status: 200, body: large_body, headers: { "Content-Type" => "image/jpeg" })

    cacher = ImageCacher.new(@entry)
    result = cacher.cache_images

    assert result.success
    assert_equal 1, result.cached_count  # Only image2.png
    assert_equal 1, result.failed_count  # Large image1.jpg
  end

  test "skips downloading already cached images" do
    # Manually create a cached image record
    CachedImage.create!(
      entry: @entry,
      original_url: "https://example.com/image1.jpg",
      cached_filename: "test_existing.jpg",
      cached_at: Time.current
    )

    cacher = ImageCacher.new(@entry)
    result = cacher.cache_images

    # Both images should be "cached" (one already existed, one newly downloaded)
    assert result.success
    assert_equal 2, result.cached_count  # Both considered cached
    assert_equal 0, result.failed_count

    # But only image2 was actually downloaded
    assert_not_requested :get, "https://example.com/image1.jpg"
    assert_requested :get, "https://example.com/image2.png", times: 1
  end

  test "returns empty result for content without images" do
    entry = entries(:basic)
    cacher = ImageCacher.new(entry)
    result = cacher.cache_images

    assert result.success
    assert_equal 0, result.cached_count
    assert_equal 0, result.failed_count
  end

  private

  def fake_jpeg
    # Minimal valid JPEG header
    "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
  end

  def fake_png
    # Minimal PNG header
    "\x89PNG\r\n\x1A\n\x00\x00\x00\rIHDR"
  end
end
