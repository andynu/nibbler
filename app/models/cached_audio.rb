# Tracks cached TTS audio for article content.
#
# When TTS is requested for an article, audio is generated using Piper TTS
# and word-level timestamps are extracted using ForceAlign. This model tracks
# the cached audio file and timestamps for playback synchronization.
#
# @see TtsGenerator for the service that populates this
# @see GenerateArticleAudioJob for the background job
class CachedAudio < ApplicationRecord
  belongs_to :entry

  validates :audio_filename, presence: true
  validates :content_hash, presence: true
  validates :duration, presence: true
  validates :timestamps, presence: true
  validates :cached_at, presence: true

  # Directory where cached audio files are stored
  CACHE_DIR = Rails.root.join("public", "audio", "cache")

  # URL path prefix for cached audio
  URL_PREFIX = "/audio/cache"

  # Returns the full filesystem path to the cached audio file
  def cached_path
    CACHE_DIR.join(audio_filename)
  end

  # Returns the URL path for serving the cached audio
  def audio_url
    "#{URL_PREFIX}/#{audio_filename}"
  end

  # Check if this cache entry is still valid for the given content
  # @param content [String] The current article content
  # @return [Boolean] true if cache is valid
  def valid_for_content?(content)
    content_hash == self.class.hash_content(content)
  end

  # Generate a hash of content for cache validation
  # @param content [String] Article content to hash
  # @return [String] SHA256 hash of normalized content
  def self.hash_content(content)
    # Strip HTML and normalize whitespace for consistent hashing
    text = ActionController::Base.helpers.strip_tags(content.to_s).squish
    Digest::SHA256.hexdigest(text)
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
