require "test_helper"

class CacheArticleImagesJobTest < ActiveJob::TestCase
  # Disable parallel execution since it modifies shared fixture data
  parallelize(workers: 1)

  setup do
    @entry = entries(:with_images)
    @cache_dir = CachedImage::CACHE_DIR
    FileUtils.mkdir_p(@cache_dir)

    # Clear any existing cached images for this entry
    @entry.cached_images.destroy_all
    @entry.update!(cached_content: nil)

    stub_request(:get, "https://example.com/image1.jpg")
      .to_return(status: 200, body: fake_jpeg, headers: { "Content-Type" => "image/jpeg" })
    stub_request(:get, "https://example.com/image2.png")
      .to_return(status: 200, body: fake_png, headers: { "Content-Type" => "image/png" })
  end

  teardown do
    @entry&.cached_images&.destroy_all
    FileUtils.rm_rf(@cache_dir)
  end

  test "caches images for entry" do
    CacheArticleImagesJob.perform_now(@entry.id)

    assert_equal 2, @entry.cached_images.count
    assert @entry.reload.cached_content.present?
  end

  test "handles missing entry gracefully" do
    assert_nothing_raised do
      CacheArticleImagesJob.perform_now(-1)
    end
  end

  test "discards on error" do
    stub_request(:get, "https://example.com/image1.jpg")
      .to_raise(StandardError.new("Network error"))
    stub_request(:get, "https://example.com/image2.png")
      .to_raise(StandardError.new("Network error"))

    # Should not raise, job discards errors
    assert_nothing_raised do
      CacheArticleImagesJob.perform_now(@entry.id)
    end
  end

  private

  def fake_jpeg
    "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
  end

  def fake_png
    "\x89PNG\r\n\x1A\n\x00\x00\x00\rIHDR"
  end
end
