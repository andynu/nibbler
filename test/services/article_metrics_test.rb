require "test_helper"

class ArticleMetricsTest < ActiveSupport::TestCase
  # ==========
  # .measure
  # ==========

  test "counts the words in the article text" do
    assert_equal({ word_count: 4, link_density: 0.0 }, ArticleMetrics.measure("<p>one two three four</p>"))
  end

  test "link density is anchors per hundred words" do
    html = '<p>one two <a href="https://a.example">three</a> four five six ' \
           '<a href="https://b.example">seven</a> eight nine ten</p>'

    metrics = ArticleMetrics.measure(html)

    assert_equal 10, metrics[:word_count]
    assert_in_delta 20.0, metrics[:link_density]
  end

  test "an anchor without an href is not a link" do
    metrics = ArticleMetrics.measure('<p><a name="top">one</a> two three four</p>')

    assert_in_delta 0.0, metrics[:link_density]
  end

  test "an empty body has no words and no density" do
    assert_equal({ word_count: 0, link_density: 0.0 }, ArticleMetrics.measure(""))
  end

  test "a nil body measures as empty" do
    assert_equal({ word_count: 0, link_density: 0.0 }, ArticleMetrics.measure(nil))
  end

  test "words split at block boundaries" do
    assert_equal 4, ArticleMetrics.measure("<p>one two</p><p>three four</p>")[:word_count]
  end

  # ==========
  # .refresh!
  # ==========

  test "refresh! stores the measurement of the feed's body" do
    entry = entries(:basic)

    ArticleMetrics.refresh!(entry)

    entry.reload
    assert_equal 2, entry.word_count
    assert_in_delta 0.0, entry.link_density
  end

  test "refresh! measures usable full text rather than the feed's body" do
    entry = entries(:basic)
    entry.create_entry_full_text!(
      status: EntryFullText::OK,
      content: '<p>The full article has <a href="https://x.example">seven</a> words in it.</p>',
      char_count: 40,
      content_hash: entry.content_hash,
      fetched_at: Time.current
    )

    ArticleMetrics.refresh!(entry)

    entry.reload
    assert_equal 8, entry.word_count
    assert_in_delta 12.5, entry.link_density
  end
end
