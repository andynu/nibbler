# Calculates the average color of a favicon image
# Used for UI theming based on feed icons
class FaviconColorCalculator
  # Calculate average color from an image file
  # Returns hex color string like "#3498db" or nil on failure
  def self.calculate(filepath)
    new(filepath).calculate
  end

  def initialize(filepath)
    @filepath = filepath
  end

  def calculate
    return nil unless File.exist?(@filepath)
    return nil if svg_file?

    # Use MiniMagick to analyze the image
    image = MiniMagick::Image.open(@filepath)

    # Resize to 1x1 to get average color
    image.resize "1x1"

    # Get the pixel color
    pixel = image.get_pixels.first&.first
    return nil unless pixel

    rgb_to_hex(pixel)
  rescue MiniMagick::Error, MiniMagick::Invalid => e
    Rails.logger.warn "MiniMagick error calculating color: #{e.message}"
    nil
  rescue StandardError => e
    Rails.logger.warn "Error calculating favicon color: #{e.message}"
    nil
  end

  private

  def svg_file?
    @filepath.to_s.end_with?(".svg")
  end

  def rgb_to_hex(rgb)
    r, g, b = rgb.map { |c| c.clamp(0, 255) }
    format("#%02x%02x%02x", r, g, b)
  end
end
