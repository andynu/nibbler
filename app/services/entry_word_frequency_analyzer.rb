# Analyzes word frequency in a single entry for tag suggestions.
#
# Similar to WordFrequencyAnalyzer but optimized for single entry analysis.
#
# @example
#   EntryWordFrequencyAnalyzer.new(entry).analyze
class EntryWordFrequencyAnalyzer
  # Use the same stopwords as WordFrequencyAnalyzer
  STOPWORDS = WordFrequencyAnalyzer::STOPWORDS

  MIN_WORD_LENGTH = 3
  MAX_WORD_LENGTH = 30
  TOP_WORDS_LIMIT = 15

  def initialize(entry, limit: TOP_WORDS_LIMIT)
    @entry = entry
    @limit = limit
  end

  def analyze
    word_counts = Hash.new(0)
    word_forms = Hash.new { |h, k| h[k] = Hash.new(0) } # Track original forms

    text = extract_text(@entry.title, @entry.content)

    tokenize(text).each do |word|
      next unless should_count?(word)

      stem = normalize(word)
      word_counts[stem] += 1
      word_forms[stem][word] += 1 # Track which form was used
    end

    word_counts
      .sort_by { |_stem, count| -count }
      .first(@limit)
      .map do |stem, count|
        # Use the most common original form for display
        display_word = word_forms[stem].max_by { |_form, c| c }.first
        { word: display_word, count: count }
      end
  end

  # Returns just the top keywords as an array of strings
  def keywords
    analyze.map { |h| h[:word] }
  end

  private

  def extract_text(title, content)
    text = [ title || "", ActionController::Base.helpers.strip_tags(content || "") ].join(" ")
    # Normalize whitespace
    text.gsub(/\s+/, " ").strip
  end

  def tokenize(text)
    # Downcase and split on non-word characters
    text.downcase.scan(/[a-z]+/)
  end

  def should_count?(word)
    return false if word.length < MIN_WORD_LENGTH
    return false if word.length > MAX_WORD_LENGTH
    return false if STOPWORDS.include?(word)
    return false if word.match?(/^\d+$/) # Skip pure numbers
    true
  end

  # Simple normalization to group related word forms (CDNs -> cdn, APIs -> api)
  # Not a full stemmer, just handles common plurals and suffixes
  def normalize(word)
    w = word.downcase

    # Handle common irregular plurals first
    return "datum" if w == "data"
    return "index" if w == "indices"
    return "appendix" if w == "appendices"

    # Strip common suffixes (order matters - check longer suffixes first)
    # -ies -> -y (technologies -> technology)
    return w[0..-4] + "y" if w.end_with?("ies") && w.length > 4

    # -es after s, x, z, ch, sh (boxes -> box, watches -> watch)
    return w[0..-3] if w.end_with?("ses", "xes", "zes", "ches", "shes") && w.length > 4

    # -s (simple plural: cdns -> cdn, apis -> api, servers -> server)
    return w[0..-2] if w.end_with?("s") && !w.end_with?("ss") && w.length > 3

    w
  end
end
