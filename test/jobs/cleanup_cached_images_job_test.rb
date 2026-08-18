require "test_helper"

class CleanupCachedImagesJobTest < ActiveJob::TestCase
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

  test "removes orphaned files" do
    # Create an orphaned file (no database record)
    orphan_path = @cache_dir.join("orphan_12345.jpg")
    File.write(orphan_path, "orphaned content")
    assert File.exist?(orphan_path)

    CleanupCachedImagesJob.perform_now

    assert_not File.exist?(orphan_path)
  end

  test "keeps files with database records" do
    # Create a file with a matching database record
    filename = "valid_#{SecureRandom.hex(4)}.jpg"
    filepath = @cache_dir.join(filename)
    File.write(filepath, "valid content")

    CachedImage.create!(
      entry: @entry,
      original_url: "https://example.com/valid.jpg",
      cached_filename: filename,
      cached_at: Time.current
    )

    CleanupCachedImagesJob.perform_now

    assert File.exist?(filepath)
  end

  test "handles empty cache directory" do
    FileUtils.rm_rf(@cache_dir)

    assert_nothing_raised do
      CleanupCachedImagesJob.perform_now
    end
  end

  test "purges records whose file is gone and clears the rewritten content" do
    cached = create_cached_image(file: false)
    @entry.update!(cached_content: %(<img src="#{cached.cached_url}">))

    CleanupCachedImagesJob.perform_now

    assert_not CachedImage.exists?(cached.id)
    assert_nil @entry.reload.cached_content
  end

  test "purges the whole entry's cache when only some files are gone" do
    survivor = create_cached_image(file: true)
    missing = create_cached_image(file: false)
    @entry.update!(cached_content: "<p>rewritten</p>")

    CleanupCachedImagesJob.perform_now

    assert_not CachedImage.exists?(missing.id)
    assert_not CachedImage.exists?(survivor.id), "a partial cache cannot be represented in cached_content"
    assert_not File.exist?(survivor.cached_path)
    assert_nil @entry.reload.cached_content
  end

  test "leaves an intact cache alone" do
    cached = create_cached_image(file: true)
    @entry.update!(cached_content: %(<img src="#{cached.cached_url}">))

    CleanupCachedImagesJob.perform_now

    assert CachedImage.exists?(cached.id)
    assert File.exist?(cached.cached_path)
    assert_not_nil @entry.reload.cached_content
  end

  private

  def create_cached_image(file:)
    filename = "cleanup_#{SecureRandom.hex(6)}.jpg"
    File.write(@cache_dir.join(filename), "content") if file

    CachedImage.create!(
      entry: @entry,
      original_url: "https://example.com/#{filename}",
      cached_filename: filename,
      cached_at: Time.current
    )
  end
end
