# Checks if an entry matches a tag name using word boundary matching.
#
# Performs case-insensitive word boundary regex matching against
# the entry's title and HTML-stripped content. Used by feed tag
# propagation to auto-apply tags to matching entries.
#
# @see ArticleText for why the content is not run through strip_tags alone.
#   Without a separator at the block boundary a body that says
#   "<li>Quokka</li><li>Bilby</li>" reads "QuokkaBilby", and neither word has a
#   boundary left to match on. A block that ends in punctuation survives -- "."
#   is itself a boundary -- so this only bites on headings, list items, table
#   cells and inline links, which is most of the markup a feed sends. Either
#   way it is a false negative: no error, no log line, the tag is simply not
#   applied.
class TagMatcher
  # Check if entry content matches the tag name
  #
  # @param entry [Entry] the entry to check
  # @param tag_name [String] the tag name to match
  # @return [Boolean] true if the entry title or content contains the tag name
  def self.matches?(entry, tag_name)
    new(entry, tag_name).matches?
  end

  def initialize(entry, tag_name)
    @entry = entry
    @tag_name = tag_name
  end

  def matches?
    pattern = /\b#{Regexp.escape(@tag_name)}\b/i
    pattern.match?(@entry.title) || pattern.match?(stripped_content)
  end

  private

  def stripped_content
    ArticleText.from_html(@entry.content)
  end
end
