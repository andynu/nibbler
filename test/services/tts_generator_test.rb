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

  # The one defect in this bug with a symptom a listener hears. strip_tags
  # removes a tag and puts nothing in its place, so the last word of one block
  # welded to the first of the next and Piper pronounced "failed.Members" as a
  # single word -- at every paragraph, list item and cell boundary in every
  # article. It also read "&amp;" and "&nbsp;" aloud as entities.
  test "the text handed to Piper keeps a boundary between adjacent blocks" do
    Rails.configuration.x.tts.enabled = true
    @entry.update!(content: "<p>The vote failed.</p><p>Members left early.</p><p>AT&amp;T&nbsp;declined.</p>")

    spoken = nil
    capture_input = lambda do |*args, **_options|
      spoken = File.read(args[args.index("--input") + 1])
      [ "{}", "", FakeStatus.new(false) ]
    end

    Open3.stub(:capture3, capture_input) do
      TtsGenerator.new(@entry).generate
    end

    assert_equal "The vote failed. Members left early. AT&T declined.", spoken
  end

  # The complaint this reads past: on an excerpt-only feed, TTS read two
  # sentences and stopped. Entry#readable_content is the seam, so where a full
  # article has been fetched it is what Piper is given.
  test "Piper is given the publisher's copy where one has been fetched" do
    Rails.configuration.x.tts.enabled = true
    @entry.update!(content: "<p>Two sentences. That is all.</p>")
    build_full_text("<p>The council voted 5-2 to reject the rezoning.</p>")

    spoken = nil
    capture_input = lambda do |*args, **_options|
      spoken = File.read(args[args.index("--input") + 1])
      [ "{}", "", FakeStatus.new(false) ]
    end

    Open3.stub(:capture3, capture_input) do
      TtsGenerator.new(@entry.reload).generate
    end

    assert_equal "The council voted 5-2 to reject the rezoning.", spoken
  end

  # Audio recorded from the excerpt is no longer the article once the rest of it
  # arrives, so the hash it is checked against has to be the same string that was
  # read aloud.
  test "generate treats audio recorded from the excerpt as a miss once the article is fetched" do
    Rails.configuration.x.tts.enabled = true
    audio = build_cached_audio
    FileUtils.mkdir_p(File.dirname(audio.cached_path))
    File.write(audio.cached_path, "wav")
    build_full_text("<p>The council voted 5-2 to reject the rezoning.</p>")

    Open3.stub(:capture3, ->(*_args, **_options) { [ "{}", "", FakeStatus.new(false) ] }) do
      TtsGenerator.new(@entry.reload).generate
    end

    assert_not CachedAudio.exists?(audio.id)
  end

  private

  def build_full_text(html)
    @entry.create_entry_full_text!(
      status: EntryFullText::OK,
      content: html,
      char_count: ArticleText.from_html(html).length,
      content_hash: @entry.content_hash,
      fetched_at: Time.current
    )
  end

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
