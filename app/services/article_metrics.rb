# Size and link-heaviness of an article, stored on Entry so filter rules can
# compare against them without reparsing the body.
#
# Measured from Entry#readable_content, so an entry whose full text has been
# fetched is measured as the article and one that has only the feed's excerpt
# is measured as the excerpt. Both callers that change what readable_content
# returns (ingest and the full-text fetch) call refresh!.
#
# link_density is anchors with an href per hundred words, so a link roundup
# scores high whatever its length. It is 0.0 for an empty body rather than
# undefined, because the column is read as a number by filter rules.
class ArticleMetrics
  # @param html [String, nil]
  # @return [Hash{Symbol => Numeric}] word_count (Integer), link_density (Float)
  def self.measure(html)
    word_count = ArticleText.from_html(html).split.size
    return { word_count: 0, link_density: 0.0 } if word_count.zero?

    links = Nokogiri::HTML.fragment(html.to_s).css("a[href]").size
    { word_count: word_count, link_density: links * 100.0 / word_count }
  end

  # Writes with update_columns: a measurement is not an edit, so it must not
  # move date_updated or run validations on the shared entry.
  #
  # @param entry [Entry]
  # @return [void]
  def self.refresh!(entry)
    entry.update_columns(measure(entry.readable_content))
  end
end
