# Tracks cached images from article content.
#
# When a feed has cache_images enabled, images from articles are downloaded
# and stored locally. This model tracks the mapping between original URLs
# and the local cached files stored in public/images/cache/.
#
# @see ImageCacher for the service that populates this
# @see CacheArticleImagesJob for the background job
class CachedImage < ApplicationRecord
  belongs_to :entry

  validates :original_url, presence: true, uniqueness: { scope: :entry_id }
  validates :cached_filename, presence: true

  # Directory where cached images are stored
  CACHE_DIR = Rails.root.join("public", "images", "cache")

  # URL path prefix for cached images
  URL_PREFIX = "/images/cache"

  # Returns the full filesystem path to the cached image
  def cached_path
    CACHE_DIR.join(cached_filename)
  end

  # Returns the URL path for serving the cached image
  def cached_url
    "#{URL_PREFIX}/#{cached_filename}"
  end

  # Delete the cached file when the record is destroyed
  after_destroy :delete_cached_file

  private

  def delete_cached_file
    File.delete(cached_path) if File.exist?(cached_path)
  rescue Errno::ENOENT
    # File already deleted, ignore
  end
end
