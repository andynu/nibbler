require "test_helper"

# Pure parsing, so nothing here makes a request. The pages are handwritten to
# hold the shapes real ones do: an article beside a comment thread, a link rail,
# relative URLs, an inline script.
class ArticleExtractorTest < ActiveSupport::TestCase
  PROSE = "The council voted 5-2 to reject the rezoning, ending a two-year fight " \
          "over the parcel on Fourth Street, which neighbours had opposed since 2024.".freeze

  SECOND = "Members said the traffic study, filed in March, understated peak volumes " \
           "by roughly a third, and asked the applicant to redo it before refiling.".freeze

  def extract(html, url: nil)
    ArticleExtractor.new(html, url: url).extract
  end

  test "returns nothing for a blank page" do
    assert_equal "", extract("")
    assert_equal "", extract(nil)
  end

  test "returns nothing for a page with no prose in it" do
    assert_equal "", extract("<html><body><div><a href='/'>Home</a></div></body></html>")
  end

  test "picks the container holding the article" do
    html = <<~HTML
      <html><body>
        <div class="sidebar"><p>#{PROSE[0, 60]}</p></div>
        <div class="post-content"><p>#{PROSE}</p><p>#{SECOND}</p></div>
      </body></html>
    HTML

    result = extract(html)

    assert_includes result, "voted 5-2"
    assert_includes result, "understated peak"
    assert_not_includes result, "sidebar"
  end

  test "leaves navigation, asides and footers out" do
    html = <<~HTML
      <html><body>
        <nav><p>#{PROSE}</p></nav>
        <aside><p>#{SECOND}</p></aside>
        <footer><p>#{PROSE}</p></footer>
        <article><p>#{PROSE}</p><p>#{SECOND}</p></article>
      </body></html>
    HTML

    result = extract(html)

    assert_includes result, "voted 5-2"
    assert_equal 2, result.scan(/<p>/).length
  end

  # A comment thread is usually longer than the piece it hangs off, so prose
  # score alone would hand it the page.
  test "loses to the article against a longer comment thread" do
    comments = Array.new(12) { "<p>#{SECOND}</p>" }.join

    html = <<~HTML
      <html><body>
        <div id="article-body"><p>#{PROSE}</p></div>
        <div id="comments">#{comments}</div>
      </body></html>
    HTML

    result = extract(html)

    assert_includes result, "voted 5-2"
    assert_not_includes result, "understated peak"
  end

  test "refuses a container that is mostly link text" do
    links = Array.new(6) { "<p><a href='/x'>#{PROSE}</a></p>" }.join

    html = <<~HTML
      <html><body>
        <div class="rail">#{links}</div>
        <div class="content"><p>#{PROSE}</p><p>#{SECOND}</p></div>
      </body></html>
    HTML

    result = extract(html)

    assert_includes result, "understated peak"
    assert_not_includes result, "href=\"/x\""
  end

  test "drops script and style before scoring" do
    html = <<~HTML
      <html><body>
        <div class="content">
          <script>var tracking = "#{'x' * 5000}";</script>
          <style>.a { color: red }</style>
          <p>#{PROSE}</p><p>#{SECOND}</p>
        </div>
      </body></html>
    HTML

    result = extract(html)

    assert_includes result, "voted 5-2"
    assert_not_includes result, "tracking"
  end

  # ContentSanitizer is the same gate feed bodies pass at ingest. A page fetched
  # from a stranger's server has no business being held to a looser one.
  test "puts the result through the ingest sanitizer" do
    html = <<~HTML
      <html><body><div class="content">
        <p onclick="steal()">#{PROSE}</p>
        <p><a href="javascript:steal()">#{SECOND}</a> #{SECOND}</p>
      </div></body></html>
    HTML

    result = extract(html)

    assert_not_includes result, "onclick"
    assert_not_includes result, "javascript:"
  end

  test "rewrites relative links and images against the page they came from" do
    html = <<~HTML
      <html><body><div class="content">
        <p>#{PROSE} <a href="/follow-up">more</a></p>
        <p><img src="../images/vote.jpg" alt="vote"> #{SECOND}</p>
      </div></body></html>
    HTML

    result = extract(html, url: "https://example.com/news/2026/story.html")

    assert_includes result, "https://example.com/follow-up"
    assert_includes result, "https://example.com/news/images/vote.jpg"
  end

  test "leaves a URL it cannot resolve exactly as it was" do
    html = <<~HTML
      <html><body><div class="content">
        <p>#{PROSE} <a href="http://[bad">broken</a></p>
        <p>#{SECOND}</p>
      </div></body></html>
    HTML

    result = extract(html, url: "https://example.com/story")

    assert_includes result, "http://[bad"
  end

  test "leaves URLs alone when no page URL was given" do
    html = "<html><body><div class='content'><p>#{PROSE} <a href='/x'>x</a></p><p>#{SECOND}</p></div></body></html>"

    assert_includes extract(html), "\"/x\""
  end
end
