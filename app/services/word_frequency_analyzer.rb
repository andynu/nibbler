# Analyzes word frequency in feed entries to help with categorization and tag suggestions.
#
# Can analyze entries from a feed or from an arbitrary collection of entries.
#
# @example Analyze a feed
#   WordFrequencyAnalyzer.new(feed).analyze
#
# @example Analyze specific entries
#   WordFrequencyAnalyzer.for_entries(entries, limit: 10).analyze
class WordFrequencyAnalyzer
  # Common English stopwords to exclude from analysis
  STOPWORDS = Set.new(%w[
    a about above after again against all am an and any are aren't as at
    be because been before being below between both but by
    can can't cannot could couldn't
    did didn't do does doesn't doing don't down during
    each even few for from further
    get gets got
    had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's
    i i'd i'll i'm i've if in into is isn't it it's its itself
    just
    let let's
    make may me might more most must my myself
    new no nor not now
    of off on once one only or other our ours ourselves out over own
    re really
    said same say see she she'd she'll she's should shouldn't so some such
    than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too
    under until up us use used using
    very
    want was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't
    you you'd you'll you're you've your yours yourself yourselves
    yet
    also always another any anything anywhere
    back become becomes been being best better between big both brought
    came come coming could
    day days did different
    early else end enough even every everything example
    far feel find first found four free
    gave give given going good got great
    hand has having help here high home
    important including information instead
    keep kind know known
    large last late later latest least left less life like likely little
    made main make makes many may maybe mean means might much must
    need needs never next nothing number
    often old older oldest one ones online
    part people place point possible problem put
    rather read real reason recent right run
    says second seems several show shows side since small someone something sometimes soon
    state still sure system
    take taken taking tell than that their them then there these things think this those though thought three time times today together took top
    under using usually
    want way ways well went were what when where whether which while will within without work working works world would
    year years yes
    via via
    post posts article articles read reading blog post posts link links
    http https www com org net html
  ])

  MIN_WORD_LENGTH = 3
  MAX_WORD_LENGTH = 30
  TOP_WORDS_LIMIT = 20

  # Create analyzer for a feed (original interface)
  def initialize(feed = nil, entries: nil, limit: TOP_WORDS_LIMIT)
    @feed = feed
    @entries = entries
    @limit = limit
  end

  # Factory method for analyzing a collection of entries
  def self.for_entries(entries, limit: TOP_WORDS_LIMIT)
    new(nil, entries: entries, limit: limit)
  end

  def analyze
    word_counts = Hash.new(0)

    entries_to_analyze.find_each do |entry|
      text = extract_text(entry.title, entry.content)

      tokenize(text).each do |word|
        word_counts[word] += 1 if should_count?(word)
      end
    end

    word_counts
      .sort_by { |_word, count| -count }
      .first(@limit)
      .map { |word, count| { word: word, count: count } }
  end

  # Returns just the top keywords as an array of strings (useful for tag suggestions)
  def keywords
    analyze.map { |h| h[:word] }
  end

  private

  def entries_to_analyze
    @entries || @feed&.entries || Entry.none
  end

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
end
