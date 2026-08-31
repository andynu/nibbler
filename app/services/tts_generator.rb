require "open3"

# Generates TTS audio from article content with word-level timestamps.
#
# Uses Piper TTS for high-quality speech synthesis and ForceAlign
# for word-level timestamp extraction. Results are cached per article
# and invalidated when content changes.
#
# @see CachedAudio for the database record
# @see GenerateArticleAudioJob for the background job that calls this
class TtsGenerator
  PYTHON_SCRIPT = Rails.root.join("lib", "tts", "generate.py")
  VENV_PYTHON = Rails.root.join(".venv", "bin", "python3")

  # Maximum text length to process (characters)
  MAX_TEXT_LENGTH = 50_000

  # Timeout for TTS generation (seconds)
  GENERATION_TIMEOUT = 300

  # Returned when the Python TTS toolchain is not installed. Surfaced to the
  # API as status "unavailable" so the UI can say so instead of reporting a
  # subprocess failure.
  UNAVAILABLE_ERROR = "Text-to-speech is not available in this environment"

  GenerationResult = Data.define(:success, :cached_audio, :error)

  # Whether TTS can run here.
  #
  # config.x.tts.enabled (TTS_ENABLED) forces the answer either way. Otherwise
  # it depends on the Python virtualenv actually being present: the production
  # image ships neither the venv nor a Python interpreter, and a venv copied
  # from a host has a dangling bin/python3 symlink, which #exist? reports as
  # missing because it resolves the link.
  #
  # @return [Boolean]
  def self.available?
    configured = Rails.configuration.x.tts.enabled
    return configured unless configured.nil?

    VENV_PYTHON.exist? && PYTHON_SCRIPT.exist?
  end

  def initialize(entry)
    @entry = entry
  end

  # Generate TTS audio for the entry's content
  # @return [GenerationResult]
  def generate
    return error_result(UNAVAILABLE_ERROR) unless self.class.available?

    ensure_cache_dir_exists

    # Extract plain text from content.
    #
    # readable_content rather than content: on a feed that publishes an excerpt,
    # content is two sentences, and TTS reading two sentences and stopping is the
    # whole complaint this reads past. Where no full text has been fetched the two
    # are the same string, so nothing changes for a feed that publishes in full.
    text = extract_text(@entry.readable_content)
    return error_result("No text content to generate audio for") if text.blank?
    return error_result("Text too long (#{text.length} chars, max #{MAX_TEXT_LENGTH})") if text.length > MAX_TEXT_LENGTH

    # Check for existing valid cache. The file has to actually be there: a
    # record whose audio is gone (a container without the cache volume, a
    # manual purge) would otherwise be reported as ready and play a 404.
    # Hashed over the same string that was read aloud, so audio recorded from an
    # excerpt is invalidated the moment the full article arrives behind it.
    content_hash = CachedAudio.hash_content(@entry.readable_content)
    existing = @entry.cached_audio
    if existing&.valid_for_content?(@entry.readable_content) && File.exist?(existing.cached_path)
      Rails.logger.debug { "Using cached TTS audio for entry #{@entry.id}" }
      return GenerationResult.new(success: true, cached_audio: existing, error: nil)
    end

    # Delete cache that is stale or has lost its file
    existing&.destroy

    # Generate new audio
    result = generate_audio(text, content_hash)
    return result unless result.success

    GenerationResult.new(success: true, cached_audio: result.cached_audio, error: nil)
  rescue StandardError => e
    Rails.logger.error("TtsGenerator failed for entry #{@entry.id}: #{e.message}")
    error_result(e.message)
  end

  private

  def ensure_cache_dir_exists
    FileUtils.mkdir_p(Rails.configuration.x.audio_cache.dir)
  end

  # The text Piper is handed.
  #
  # ArticleText rather than strip_tags because strip_tags puts nothing in a
  # tag's place, so every paragraph boundary welded the last word of one block
  # to the first of the next and Piper pronounced the pair as one word.
  def extract_text(html)
    ArticleText.from_html(html)
  end

  # Generate audio using Python TTS script
  def generate_audio(text, content_hash)
    filename = "#{@entry.id}_#{content_hash[0, 16]}"
    output_base = Rails.configuration.x.audio_cache.dir.join(filename)

    # Create temp file with text content
    text_file = Tempfile.new([ "tts_text", ".txt" ])
    text_file.write(text)
    text_file.close

    begin
      # Call Python script
      result = execute_python_script(text_file.path, output_base)
      return result unless result.success

      # Parse result JSON
      audio_path = output_base.sub_ext(".wav")
      json_path = output_base.sub_ext(".json")

      unless File.exist?(audio_path) && File.exist?(json_path)
        return error_result("TTS generation did not produce expected output files")
      end

      # Read timestamps from JSON
      json_data = JSON.parse(File.read(json_path))
      File.delete(json_path) # Clean up JSON file, we store timestamps in DB

      # Create cache record
      cached_audio = CachedAudio.create!(
        entry: @entry,
        audio_filename: "#{filename}.wav",
        content_hash: content_hash,
        duration: json_data["duration"],
        timestamps: json_data["timestamps"],
        cached_at: Time.current
      )

      GenerationResult.new(success: true, cached_audio: cached_audio, error: nil)
    ensure
      text_file.unlink
    end
  end

  def execute_python_script(text_path, output_base)
    stdout, stderr, status = Open3.capture3(
      VENV_PYTHON.to_s,
      PYTHON_SCRIPT.to_s,
      "--input", text_path.to_s,
      "--output", output_base.to_s,
      "--json-only",
      chdir: Rails.root.to_s
    )

    unless status.success?
      return error_result("Python TTS script failed: #{stderr}")
    end

    # Parse JSON output
    begin
      result = JSON.parse(stdout)
      if result["error"]
        return error_result(result["error"])
      end
    rescue JSON::ParserError => e
      return error_result("Failed to parse TTS output: #{e.message}")
    end

    GenerationResult.new(success: true, cached_audio: nil, error: nil)
  end

  def error_result(message)
    GenerationResult.new(success: false, cached_audio: nil, error: message)
  end
end
