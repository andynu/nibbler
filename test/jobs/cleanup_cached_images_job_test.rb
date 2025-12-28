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
end
