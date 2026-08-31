require "test_helper"

class WordFrequencyAnalyzerTest < ActiveSupport::TestCase
  def setup
    @user = User.first
    @feed = feeds(:high_frequency)
  end

  test "excludes stopwords from analysis" do
    # WordFrequencyAnalyzer should not include common English stopwords
    stopwords = WordFrequencyAnalyzer::STOPWORDS

    assert stopwords.include?("the"), "Should include 'the'"
    assert stopwords.include?("is"), "Should include 'is'"
    assert stopwords.include?("and"), "Should include 'and'"
    assert stopwords.include?("a"), "Should include 'a'"
    refute stopwords.include?("ruby"), "Should not include content words like 'ruby'"
  end

  test "returns limited number of words" do
    # The analyzer should limit results to TOP_WORDS_LIMIT
    assert_equal 20, WordFrequencyAnalyzer::TOP_WORDS_LIMIT
  end

  test "filters out short words" do
    assert_equal 3, WordFrequencyAnalyzer::MIN_WORD_LENGTH
    # Words shorter than 3 chars should be filtered out
  end

  test "returns empty array for feed with no entries" do
    empty_feed = Feed.create!(
      title: "Empty Feed",
      feed_url: "https://example.com/empty.xml",
      user: @user
    )

    analyzer = WordFrequencyAnalyzer.new(empty_feed)
    results = analyzer.analyze

    assert_equal [], results
  end

  # strip_tags removes a tag and puts nothing in its place, so a block ending
  # in a letter fused with the next one starting with a letter. The tokenizer
  # then counted a term that appears in no article, and the two real words each
  # lost a count. The re-encoded entities cost another two: "&nbsp;" and
  # "&amp;" survive strip_tags as literal text and tokenize to "nbsp"/"amp".
  test "block boundaries and entities do not invent their own terms" do
    entry = Entry.create!(
      guid: "wfa-welding-#{SecureRandom.hex(4)}",
      title: "Wildlife survey",
      link: "https://example.com/welding",
      content: "<h2>Quokka</h2><p>Bilby&nbsp;numbers rose</p><p>Quokka numbers fell &amp; rose</p>",
      content_hash: SecureRandom.hex(8),
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    )

    counts = WordFrequencyAnalyzer.for_entries(Entry.where(id: entry.id))
                                  .analyze.to_h { |h| [ h[:word], h[:count] ] }

    assert_equal 2, counts["quokka"]
    assert_equal 1, counts["bilby"]
    assert_not_includes counts.keys, "quokkabilby"
    assert_not_includes counts.keys, "nbsp"
    assert_not_includes counts.keys, "amp"
  end

  test "analyzes real feed entries" do
    # Use fixture feed which has entries
    analyzer = WordFrequencyAnalyzer.new(@feed)
    results = analyzer.analyze

    # Results should be an array of word/count hashes
    assert_kind_of Array, results
    results.each do |result|
      assert result.key?(:word), "Each result should have a :word key"
      assert result.key?(:count), "Each result should have a :count key"
      assert_kind_of String, result[:word]
      assert_kind_of Integer, result[:count]
    end
  end
end
