require "test_helper"

class TtsGeneratorTest < ActiveSupport::TestCase
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
end
