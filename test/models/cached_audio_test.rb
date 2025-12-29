require "test_helper"

class CachedAudioTest < ActiveSupport::TestCase
  setup do
    @entry = entries(:basic)
    @cache_dir = CachedAudio::CACHE_DIR
    FileUtils.mkdir_p(@cache_dir)
  end

  teardown do
    CachedAudio.where(entry: @entry).destroy_all
    FileUtils.rm_rf(@cache_dir)
  end

  test "hash_content generates consistent hash for same content" do
    content = "<p>Hello world</p>"
    hash1 = CachedAudio.hash_content(content)
    hash2 = CachedAudio.hash_content(content)

    assert_equal hash1, hash2
  end

  test "hash_content normalizes HTML and whitespace" do
    content1 = "<p>Hello   world</p>"
    content2 = "<div>Hello world</div>"
    content3 = "Hello world"

    # All should produce same hash after stripping HTML and normalizing whitespace
    assert_equal CachedAudio.hash_content(content1), CachedAudio.hash_content(content2)
    assert_equal CachedAudio.hash_content(content2), CachedAudio.hash_content(content3)
  end

  test "hash_content produces different hash for different content" do
    content1 = "<p>Hello world</p>"
    content2 = "<p>Goodbye world</p>"

    assert_not_equal CachedAudio.hash_content(content1), CachedAudio.hash_content(content2)
  end

  test "valid_for_content? returns true for matching content" do
    cached = CachedAudio.new(
      entry: @entry,
      audio_filename: "test.wav",
      content_hash: CachedAudio.hash_content(@entry.content),
      duration: 1.0,
      timestamps: [],
      cached_at: Time.current
    )

    assert cached.valid_for_content?(@entry.content)
  end

  test "valid_for_content? returns false for changed content" do
    cached = CachedAudio.new(
      entry: @entry,
      audio_filename: "test.wav",
      content_hash: CachedAudio.hash_content(@entry.content),
      duration: 1.0,
      timestamps: [],
      cached_at: Time.current
    )

    assert_not cached.valid_for_content?("<p>Different content</p>")
  end

  test "audio_url returns correct path" do
    cached = CachedAudio.new(
      entry: @entry,
      audio_filename: "test_audio.wav",
      content_hash: "abc123",
      duration: 1.0,
      timestamps: [],
      cached_at: Time.current
    )

    assert_equal "/audio/cache/test_audio.wav", cached.audio_url
  end

  test "cached_path returns full filesystem path" do
    cached = CachedAudio.new(
      entry: @entry,
      audio_filename: "test_audio.wav",
      content_hash: "abc123",
      duration: 1.0,
      timestamps: [],
      cached_at: Time.current
    )

    expected = Rails.root.join("public", "audio", "cache", "test_audio.wav")
    assert_equal expected, cached.cached_path
  end

  test "deletes cached file on destroy" do
    # Create a fake audio file
    filename = "test_delete.wav"
    filepath = @cache_dir.join(filename)
    File.write(filepath, "fake audio content")

    cached = CachedAudio.create!(
      entry: @entry,
      audio_filename: filename,
      content_hash: "abc123",
      duration: 1.0,
      timestamps: [ { word: "test", start: 0.0, end: 0.5 } ],
      cached_at: Time.current
    )

    assert File.exist?(filepath)

    cached.destroy

    assert_not File.exist?(filepath)
  end
end
