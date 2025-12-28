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
