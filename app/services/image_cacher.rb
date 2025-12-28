# Downloads and caches images from article content.
#
# Extracts image URLs from HTML content, downloads them to disk,
# and updates the entry's cached_content with rewritten URLs pointing
# to the local cache.
#
# @see CachedImage for the database record
# @see CacheArticleImagesJob for the background job that calls this
class ImageCacher
  CACHE_DIR = CachedImage::CACHE_DIR
  URL_PREFIX = CachedImage::URL_PREFIX

  # Maximum image size to cache (5MB)
  MAX_IMAGE_SIZE = 5.megabytes

  # Timeout for image downloads
  DOWNLOAD_TIMEOUT = 15

  # Allowed image content types
  ALLOWED_CONTENT_TYPES = %w[
    image/jpeg
    image/png
    image/gif
    image/webp
    image/svg+xml
  ].freeze

  CacheResult = Data.define(:success, :cached_count, :failed_count, :error)

  def initialize(entry)
    @entry = entry
  end

  # Cache all images in the entry's content
  # @return [CacheResult]
  def cache_images
    ensure_cache_dir_exists

    image_urls = extract_image_urls(@entry.content)
    return CacheResult.new(success: true, cached_count: 0, failed_count: 0, error: nil) if image_urls.empty?

    cached_count = 0
    failed_count = 0

    image_urls.each do |url|
      if cache_image(url)
        cached_count += 1
      else
        failed_count += 1
      end
    end

    # Rewrite content with cached URLs
    update_cached_content

    CacheResult.new(success: true, cached_count: cached_count, failed_count: failed_count, error: nil)
  rescue StandardError => e
    Rails.logger.error("ImageCacher failed for entry #{@entry.id}: #{e.message}")
    CacheResult.new(success: false, cached_count: 0, failed_count: 0, error: e.message)
  end

  private

  def ensure_cache_dir_exists
    FileUtils.mkdir_p(CACHE_DIR)
  end

  # Extract image URLs from HTML content
  def extract_image_urls(html)
    doc = Nokogiri::HTML.fragment(html)
    urls = Set.new

    # Find all img tags
    doc.css("img[src]").each do |img|
      src = img["src"]
      urls.add(src) if valid_image_url?(src)
    end

    # Find images in srcset
    doc.css("img[srcset], source[srcset]").each do |elem|
      srcset = elem["srcset"]
      next if srcset.blank?

      srcset.split(",").each do |srcset_entry|
        url = srcset_entry.strip.split(/\s+/).first
        urls.add(url) if valid_image_url?(url)
      end
    end

    urls.to_a
  end

  def valid_image_url?(url)
    return false if url.blank?
    return false if url.start_with?("data:")  # Skip data URIs
    return false unless url.match?(%r{\Ahttps?://}i)

    true
  end

  # Download and cache a single image
  # @return [Boolean] true if successful
  def cache_image(url)
    # Check if already cached
    return true if CachedImage.exists?(entry: @entry, original_url: url)

    response = download_image(url)
    return false unless response

    content_type = response[:content_type]
    return false unless ALLOWED_CONTENT_TYPES.include?(content_type)

    # Generate unique filename
    filename = generate_filename(url, content_type)
    filepath = CACHE_DIR.join(filename)

    # Write to disk
    File.binwrite(filepath, response[:body])

    # Create database record
    CachedImage.create!(
      entry: @entry,
      original_url: url,
      cached_filename: filename,
      content_type: content_type,
      file_size: response[:body].bytesize,
      cached_at: Time.current
    )

    true
  rescue StandardError => e
    Rails.logger.debug { "Failed to cache image #{url}: #{e.message}" }
    false
  end

  def download_image(url)
    response = connection.get(url)

    return nil unless response.status == 200
    return nil if response.body.bytesize > MAX_IMAGE_SIZE

    content_type = normalize_content_type(response.headers["content-type"])

    { body: response.body, content_type: content_type }
  rescue Faraday::TimeoutError, Faraday::ConnectionFailed
    nil
  end

  def normalize_content_type(content_type)
    return "application/octet-stream" if content_type.blank?

    # Extract just the MIME type, ignoring charset etc.
    content_type.split(";").first.strip.downcase
  end

  def generate_filename(url, content_type)
    # Use entry ID + hash of URL for uniqueness
    url_hash = Digest::SHA256.hexdigest(url)[0, 16]
    extension = extension_for_content_type(content_type)
    "#{@entry.id}_#{url_hash}#{extension}"
  end

  def extension_for_content_type(content_type)
    case content_type
    when "image/jpeg" then ".jpg"
    when "image/png" then ".png"
    when "image/gif" then ".gif"
    when "image/webp" then ".webp"
    when "image/svg+xml" then ".svg"
    else ".bin"
    end
  end

  # Rewrite content to use cached image URLs
  def update_cached_content
    # Reload to get freshly created cached_images
    @entry.cached_images.reload
    cached_images = @entry.cached_images.to_a
    return if cached_images.empty?

    # Build URL mapping
    url_map = cached_images.each_with_object({}) do |cached, map|
      map[cached.original_url] = cached.cached_url
    end

    # Parse and rewrite HTML
    doc = Nokogiri::HTML.fragment(@entry.content)

    # Rewrite img src attributes
    doc.css("img[src]").each do |img|
      src = img["src"]
      img["src"] = url_map[src] if url_map.key?(src)
    end

    # Rewrite srcset attributes
    doc.css("img[srcset], source[srcset]").each do |elem|
      srcset = elem["srcset"]
      next if srcset.blank?

      new_srcset = srcset.split(",").map do |entry|
        parts = entry.strip.split(/\s+/)
        url = parts.first
        descriptor = parts[1..]&.join(" ")

        if url_map.key?(url)
          descriptor.present? ? "#{url_map[url]} #{descriptor}" : url_map[url]
        else
          entry
        end
      end.join(", ")

      elem["srcset"] = new_srcset
    end

    @entry.update!(cached_content: doc.to_html)
  end

  def connection
    @connection ||= Faraday.new do |f|
      f.options.timeout = DOWNLOAD_TIMEOUT
      f.options.open_timeout = 10
      f.headers["User-Agent"] = FeedFetcher::USER_AGENT
      f.response :follow_redirects, limit: 3
      f.adapter Faraday.default_adapter
    end
  end
end
