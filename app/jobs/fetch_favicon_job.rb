# Job to fetch and cache a feed's favicon
# Updates the feed with icon_url and favicon_avg_color
class FetchFaviconJob < ApplicationJob
  queue_as :default

  # Don't retry on failure - we'll try again on the next scheduled run
  discard_on StandardError

  ICONS_DIR = Rails.root.join("public", "icons")

  def perform(feed_id)
    feed = Feed.find_by(id: feed_id)
    return unless feed
    return if feed.favicon_is_custom # Don't overwrite custom favicons

    result = FaviconFetcher.new(feed).fetch

    if result.success?
      save_favicon(feed, result)
    else
      Rails.logger.info "No favicon found for feed #{feed.id} (#{feed.title}): #{result.error}"
      feed.update!(favicon_last_checked: Time.current)
    end
  end

  private

  def save_favicon(feed, result)
    ensure_icons_dir_exists

    # Determine file extension from content type
    extension = extension_for_content_type(result.content_type)
    filename = "#{feed.id}#{extension}"
    filepath = ICONS_DIR.join(filename)

    # Write the icon file
    File.binwrite(filepath, result.image_data)

    # Calculate average color
    avg_color = calculate_average_color(filepath)

    # Update feed with icon URL and color
    feed.update!(
      icon_url: "/icons/#{filename}",
      favicon_avg_color: avg_color,
      favicon_last_checked: Time.current
    )

    Rails.logger.info "Saved favicon for feed #{feed.id} (#{feed.title}) from #{result.source}"
  end

  def ensure_icons_dir_exists
    FileUtils.mkdir_p(ICONS_DIR)
  end

  def extension_for_content_type(content_type)
    case content_type
    when "image/png" then ".png"
    when "image/gif" then ".gif"
    when "image/jpeg" then ".jpg"
    when "image/svg+xml" then ".svg"
    when "image/x-icon", "image/vnd.microsoft.icon" then ".ico"
    else ".ico" # Default
    end
  end

  def calculate_average_color(filepath)
    FaviconColorCalculator.calculate(filepath)
  rescue StandardError => e
    Rails.logger.warn "Failed to calculate average color: #{e.message}"
    nil
  end
end
