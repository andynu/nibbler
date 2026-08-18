require "test_helper"

class TtsGeneratorTest < ActiveSupport::TestCase
  # Stands in for the Process::Status that Open3.capture3 returns.
  FakeStatus = Struct.new(:success) do
    def success? = success
  end

  def setup
    @entry = entries(:basic)
    @original_flag = Rails.configuration.x.tts.enabled
  end

  def teardown
    Rails.configuration.x.tts.enabled = @original_flag
  end

  test "available? honours the configured flag over interpreter detection" do
    Rails.configuration.x.tts.enabled = false
    refute_predicate TtsGenerator, :available?

    Rails.configuration.x.tts.enabled = true
    assert_predicate TtsGenerator, :available?
  end

  test "available? falls back to the venv interpreter when unconfigured" do
    Rails.configuration.x.tts.enabled = nil

    TtsGenerator::VENV_PYTHON.stub(:exist?, false) do
      refute_predicate TtsGenerator, :available?
    end

    TtsGenerator::VENV_PYTHON.stub(:exist?, true) do
      TtsGenerator::PYTHON_SCRIPT.stub(:exist?, true) do
        assert_predicate TtsGenerator, :available?
      end
    end
  end

  test "available? reports missing when the python script is absent" do
    Rails.configuration.x.tts.enabled = nil

    TtsGenerator::VENV_PYTHON.stub(:exist?, true) do
      TtsGenerator::PYTHON_SCRIPT.stub(:exist?, false) do
        refute_predicate TtsGenerator, :available?
      end
    end
  end

  test "generate reports unavailable without shelling out" do
    Rails.configuration.x.tts.enabled = false

    shelled_out = false
    Open3.stub(:capture3, ->(*) { shelled_out = true }) do
      result = TtsGenerator.new(@entry).generate

      refute result.success
      assert_equal TtsGenerator::UNAVAILABLE_ERROR, result.error
      assert_nil result.cached_audio
    end

    refute shelled_out, "TtsGenerator must not spawn the Python process when TTS is unavailable"
  end

  test "generate does not create a cache record when unavailable" do
    Rails.configuration.x.tts.enabled = false

    assert_no_difference "CachedAudio.count" do
      TtsGenerator.new(@entry).generate
    end
  end

  test "generate treats a cache record with no audio file as a miss" do
    Rails.configuration.x.tts.enabled = true
    cached = build_cached_audio
    assert_not File.exist?(cached.cached_path)

    regenerated = false
    Open3.stub(:capture3, ->(*) { regenerated = true; [ "{}", "", FakeStatus.new(false) ] }) do
      TtsGenerator.new(@entry).generate
    end

    assert regenerated, "a record whose audio file is gone must not be served as a cache hit"
    assert_not CachedAudio.exists?(cached.id)
  end

  test "generate serves a cache record whose audio file is present" do
    Rails.configuration.x.tts.enabled = true
    cached = build_cached_audio
    FileUtils.mkdir_p(Rails.configuration.x.audio_cache.dir)
    File.binwrite(cached.cached_path, "RIFF")

    begin
      shelled_out = false
      Open3.stub(:capture3, ->(*) { shelled_out = true; [ "{}", "", FakeStatus.new(false) ] }) do
        result = TtsGenerator.new(@entry).generate

        assert result.success
        assert_equal cached, result.cached_audio
      end

      refute shelled_out, "an intact cache must not regenerate"
    ensure
      File.delete(cached.cached_path) if File.exist?(cached.cached_path)
    end
  end

  private

  def build_cached_audio
    CachedAudio.create!(
      entry: @entry,
      audio_filename: "tts_#{SecureRandom.hex(6)}.wav",
      content_hash: CachedAudio.hash_content(@entry.content),
      duration: 1.0,
      timestamps: [ { "word" => "hello", "start" => 0.0, "end" => 1.0 } ],
      cached_at: Time.current
    )
  end
end
