# Job to cache images from an article's content
# Enqueued when an entry is created for a feed with cache_images enabled
class CacheArticleImagesJob < ApplicationJob
  queue_as :default

  # Don't retry failed image caching - not critical
  discard_on StandardError

  def perform(entry_id)
    entry = Entry.find_by(id: entry_id)
    return unless entry

    result = ImageCacher.new(entry).cache_images

    if result.success
      Rails.logger.info "Cached #{result.cached_count} images for entry #{entry.id} (#{result.failed_count} failed)"
    else
      Rails.logger.warn "Image caching failed for entry #{entry.id}: #{result.error}"
    end
  end
end
