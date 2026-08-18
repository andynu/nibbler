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

    previous_url = feed.icon_url
    filename = filename_for(feed, result)
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

    delete_superseded_icon(previous_url, filename)

    Rails.logger.info "Saved favicon for feed #{feed.id} (#{feed.title}) from #{result.source}"
  end

  # The content digest in the name is what lets the URL change when the bytes
  # change. public/ is served with a one-year Cache-Control (see
  # config/environments/production.rb), so a stable "#{feed.id}.png" would leave
  # every browser that already fetched an icon showing the old one for up to a
  # year after UpdateFaviconsJob refetched it.
  def filename_for(feed, result)
    digest = Digest::SHA256.hexdigest(result.image_data)[0, 16]
    "#{feed.id}-#{digest}#{extension_for_content_type(result.content_type)}"
  end

  # Once icon_url moves to the new digest, the old file is unreachable and
  # nothing else references it. Leaving it would grow the icons volume by one
  # file per favicon change, forever.
  #
  # Resolved by basename through the icons dir so a stored icon_url can never
  # aim the delete outside that directory.
  def delete_superseded_icon(previous_url, current_filename)
    return if previous_url.blank?

    previous_filename = File.basename(previous_url)
    return if previous_filename == current_filename

    previous_path = ICONS_DIR.join(previous_filename)
    File.delete(previous_path) if File.file?(previous_path)
  rescue Errno::ENOENT
    # Raced with another cleanup, or the volume is gone. Nothing to remove.
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
