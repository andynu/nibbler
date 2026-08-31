require "test_helper"

class EntryWordFrequencyAnalyzerTest < ActiveSupport::TestCase
  setup do
    @entry = entries(:basic)
    @entry.title = "Wildlife survey"
  end

  test "counts words from the title and the body, skipping stopwords" do
    @entry.content = "<p>The quokka census counted every quokka.</p>"

    counts = EntryWordFrequencyAnalyzer.new(@entry).analyze.to_h { |h| [ h[:word], h[:count] ] }

    assert_equal 2, counts["quokka"]
    assert_equal 1, counts["wildlife"]
    assert_not_includes counts.keys, "the"
  end

  # strip_tags removes a tag and puts nothing in its place, so a block that
  # ends in a letter fused with the next one that starts with a letter. The
  # tokenizer then saw one term that is in no article, and each of the two real
  # words lost a count.
  test "a block boundary is not counted as a word of its own" do
    @entry.content = "<h2>Quokka</h2><p>Bilby numbers rose</p><p>Quokka numbers fell</p>"

    counts = EntryWordFrequencyAnalyzer.new(@entry).analyze.to_h { |h| [ h[:word], h[:count] ] }

    assert_equal 2, counts["quokka"]
    assert_equal 1, counts["bilby"]
    assert_not_includes counts.keys, "quokkabilby"
  end

  # strip_tags re-encodes on the way out, so "&nbsp;" and "&amp;" survive as
  # literal text and the [a-z]+ tokenizer harvested "nbsp" and "amp" from them.
  test "entity names are not counted as words" do
    @entry.content = "<p>Numbat&nbsp;sightings&nbsp;rose. Bilby&nbsp;numbers&nbsp;fell &amp; rose.</p>"

    keywords = EntryWordFrequencyAnalyzer.new(@entry).keywords

    assert_not_includes keywords, "nbsp"
    assert_not_includes keywords, "amp"
    assert_includes keywords, "numbat"
  end

  test "markup is never counted" do
    @entry.content = '<div class="teaser"><a href="https://tracker.example/x">Quokka</a></div>'

    keywords = EntryWordFrequencyAnalyzer.new(@entry).keywords

    assert_includes keywords, "quokka"
    assert_not_includes keywords, "teaser"
    assert_not_includes keywords, "href"
  end

  test "an entry with no body still counts its title" do
    @entry.title = "Numbat sightings"
    @entry.content = ""

    assert_includes EntryWordFrequencyAnalyzer.new(@entry).keywords, "numbat"
  end
end
