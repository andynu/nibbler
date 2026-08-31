require "cgi"

# Turns a stored HTML body into the plain article text every non-rendering
# consumer wants: tags flattened to spaces, entities decoded, whitespace
# collapsed.
#
# This exists because ActionView::Helpers::SanitizeHelper#strip_tags is the
# wrong tool used alone, in two ways that every caller hit independently.
#
# 1. It removes a tag and puts NOTHING in its place. Every stored body is block
#    markup, so adjacent blocks fuse: "<p>The vote failed.</p><p>Members left
#    early.</p>" comes back as "The vote failed.Members left early.", and a
#    long article invents a token at every paragraph, list item and table cell
#    boundary. Piper reads the welded token aloud, the word-frequency analyzers
#    count it as a term while the two real words each lose a count, and a
#    word-boundary tag match against "Members" silently fails.
#
# 2. It re-encodes special characters on the way out, so its output still
#    carries "&amp;" and "&nbsp;" as literal text. TTS reads the entity aloud,
#    the tokenizers turn it into the terms "amp" and "nbsp", and an LLM prompt
#    spends six characters of noise where a space belongs. CGI.unescapeHTML on
#    its own does not know &nbsp;, hence the separate substitution.
#
# The tags-to-space substitution is the same one Entry::SEARCH_DOCUMENT_SQL and
# the tsvector_combined generated column make, for the same reason, so the
# search index and the Ruby paths now agree on what an article says.
#
# @example
#   ArticleText.from_html("<p>The vote failed.</p><p>Members left early.</p>")
#   # => "The vote failed. Members left early."
#
# @see Entry::SEARCH_DOCUMENT_SQL for the SQL-side twin
# @see ContentSanitizer for the ingest-time pass this rests on
class ArticleText
  # Matched and replaced with a space before strip_tags runs.
  #
  # Safe on stored bodies because ContentSanitizer runs every one of them
  # through Loofah at ingest (FeedParser), and Loofah escapes any ">" inside an
  # attribute value to &gt; -- so no stored tag contains the character that
  # would end this match early and spill the rest of the tag into the text.
  # strip_tags still runs afterwards, so anything this pattern leaves behind is
  # handled by the real sanitizer rather than by a regex.
  TAG_PATTERN = /<[^>]*>/

  # CGI.unescapeHTML handles &amp;, &lt;, &gt; and &quot; but not &nbsp;, which
  # is the entity feeds emit most.
  NBSP_ENTITY = /&nbsp;/i

  # The plain text of an HTML body.
  #
  # @param html [String, nil] a stored, already-sanitized article body
  # @return [String] plain text, or "" for a blank body
  def self.from_html(html)
    source = html.to_s
    return "" if source.blank?

    stripped = ActionController::Base.helpers.strip_tags(source.gsub(TAG_PATTERN, " "))
    CGI.unescapeHTML(stripped.gsub(NBSP_ENTITY, " ")).squish
  end
end
