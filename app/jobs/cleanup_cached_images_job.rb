# Job to clean up old cached images from entries that have been deleted
# Run periodically via cron or scheduled job
class CleanupCachedImagesJob < ApplicationJob
  queue_as :default

  CACHE_DIR = CachedImage::CACHE_DIR

  def perform
    cleaned_count = cleanup_orphaned_files

    Rails.logger.info "Cleaned up #{cleaned_count} orphaned cached image files"
  end

  private

  # Remove files in cache directory that don't have a database record
  def cleanup_orphaned_files
    return 0 unless Dir.exist?(CACHE_DIR)

    # Get all cached filenames from database
    valid_filenames = CachedImage.pluck(:cached_filename).to_set

    cleaned_count = 0

    Dir.foreach(CACHE_DIR) do |filename|
      next if filename.start_with?(".")
      next if valid_filenames.include?(filename)

      filepath = CACHE_DIR.join(filename)
      if File.file?(filepath)
        File.delete(filepath)
        cleaned_count += 1
      end
    end

    cleaned_count
  end
end
