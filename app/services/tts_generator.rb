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
  CACHE_DIR = CachedAudio::CACHE_DIR
  PYTHON_SCRIPT = Rails.root.join("lib", "tts", "generate.py")
  VENV_PYTHON = Rails.root.join(".venv", "bin", "python3")

  # Maximum text length to process (characters)
  MAX_TEXT_LENGTH = 50_000

  # Timeout for TTS generation (seconds)
  GENERATION_TIMEOUT = 300

  GenerationResult = Data.define(:success, :cached_audio, :error)

  def initialize(entry)
    @entry = entry
  end

  # Generate TTS audio for the entry's content
  # @return [GenerationResult]
  def generate
    ensure_cache_dir_exists

    # Extract plain text from content
    text = extract_text(@entry.content)
    return error_result("No text content to generate audio for") if text.blank?
    return error_result("Text too long (#{text.length} chars, max #{MAX_TEXT_LENGTH})") if text.length > MAX_TEXT_LENGTH

    # Check for existing valid cache
    content_hash = CachedAudio.hash_content(@entry.content)
    existing = @entry.cached_audio
    if existing&.valid_for_content?(@entry.content)
      Rails.logger.debug { "Using cached TTS audio for entry #{@entry.id}" }
      return GenerationResult.new(success: true, cached_audio: existing, error: nil)
    end

    # Delete stale cache if content changed
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
    FileUtils.mkdir_p(CACHE_DIR)
  end

  # Extract plain text from HTML content
  def extract_text(html)
    return "" if html.blank?

    text = ActionController::Base.helpers.strip_tags(html)
    # Normalize whitespace
    text.gsub(/\s+/, " ").strip
  end

  # Generate audio using Python TTS script
  def generate_audio(text, content_hash)
    filename = "#{@entry.id}_#{content_hash[0, 16]}"
    output_base = CACHE_DIR.join(filename)

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
