# Reconciles the CachedImage table with public/images/cache in both directions.
# Run periodically via GoodJob cron.
class CleanupCachedImagesJob < ApplicationJob
  queue_as :default

  CACHE_DIR = CachedImage::CACHE_DIR

  def perform
    purged_count = purge_entries_with_missing_files
    cleaned_count = cleanup_orphaned_files

    Rails.logger.info "Cleaned up #{cleaned_count} orphaned cached image files " \
                      "and purged #{purged_count} cached image records with no file"
  end

  private

  # Drop cache records whose file is gone. The mirror image of the file sweep
  # below, and the state a deploy produced before public/images/cache was a
  # persistent volume: the rows survive, the files do not, and
  # Entry#cached_content keeps rewriting <img> tags to URLs that 404 forever.
  #
  # Purges the whole entry's cache rather than only the missing rows, because
  # cached_content rewrites every image in a single pass and cannot represent a
  # partial cache. Clearing it falls the article back to its original remote
  # image URLs, which work.
  #
  # @return [Integer] number of CachedImage records destroyed
  def purge_entries_with_missing_files
    entry_ids = Set.new

    CachedImage.find_each do |cached|
      entry_ids << cached.entry_id unless File.exist?(cached.cached_path)
    end

    return 0 if entry_ids.empty?

    purged = CachedImage.where(entry_id: entry_ids).destroy_all.size
    Entry.where(id: entry_ids).update_all(cached_content: nil)

    purged
  end

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
