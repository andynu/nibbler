require "test_helper"

class CachedImageTest < ActiveSupport::TestCase
  # Disable parallel execution since it modifies shared fixture data
  parallelize(workers: 1)

  setup do
    @entry = entries(:basic)
    @cache_dir = CachedImage::CACHE_DIR
    FileUtils.mkdir_p(@cache_dir)
  end

  teardown do
    FileUtils.rm_rf(@cache_dir)
  end

  test "cached_path returns full filesystem path" do
    cached = CachedImage.new(
      entry: @entry,
      original_url: "https://example.com/image.jpg",
      cached_filename: "test_abc123.jpg",
      cached_at: Time.current
    )

    assert_equal @cache_dir.join("test_abc123.jpg").to_s, cached.cached_path.to_s
  end

  test "cached_url returns URL path" do
    cached = CachedImage.new(
      entry: @entry,
      original_url: "https://example.com/image.jpg",
      cached_filename: "test_abc123.jpg",
      cached_at: Time.current
    )

    assert_equal "/images/cache/test_abc123.jpg", cached.cached_url
  end

  test "deletes cached file on destroy" do
    # Create a temp file
    filename = "test_delete_#{SecureRandom.hex(4)}.jpg"
    filepath = @cache_dir.join(filename)
    File.write(filepath, "test content")
    assert File.exist?(filepath)

    cached = CachedImage.create!(
      entry: @entry,
      original_url: "https://example.com/delete_me.jpg",
      cached_filename: filename,
      cached_at: Time.current
    )

    cached.destroy

    assert_not File.exist?(filepath)
  end

  test "validates presence of original_url" do
    cached = CachedImage.new(
      entry: @entry,
      cached_filename: "test.jpg",
      cached_at: Time.current
    )

    assert_not cached.valid?
    assert_includes cached.errors[:original_url], "can't be blank"
  end

  test "validates uniqueness of original_url per entry" do
    CachedImage.create!(
      entry: @entry,
      original_url: "https://example.com/unique.jpg",
      cached_filename: "unique1.jpg",
      cached_at: Time.current
    )

    duplicate = CachedImage.new(
      entry: @entry,
      original_url: "https://example.com/unique.jpg",
      cached_filename: "unique2.jpg",
      cached_at: Time.current
    )

    assert_not duplicate.valid?
    assert_includes duplicate.errors[:original_url], "has already been taken"
  end
end
