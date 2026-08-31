require "test_helper"

class ArticleTextTest < ActiveSupport::TestCase
  # --- the welding defect ----------------------------------------------------

  test "adjacent blocks keep a separator between their words" do
    assert_equal "The vote failed. Members left early.",
      ArticleText.from_html("<p>The vote failed.</p><p>Members left early.</p>")
  end

  test "list items, cells and inline links all keep their boundaries" do
    html = "<ul><li>Ninety million dollars</li><li>Nine quarters</li></ul>" \
           "<table><tr><td>Alpha</td><td>Beta</td></tr></table>" \
           '<p>See <a href="https://e.example">the filing</a>for details.</p>'

    assert_equal "Ninety million dollars Nine quarters Alpha Beta See the filing for details.",
      ArticleText.from_html(html)
  end

  # The four-element document from the bug report: strip_tags alone returned
  # "ablinkd", which contains none of the four words it was given.
  test "a document of four elements does not collapse into one token" do
    html = ContentSanitizer.sanitize('<p>a</p><p>b</p><a href="https://e.example">link</a>d')

    assert_equal "a b link d", ArticleText.from_html(html)
  end

  # --- the entity defect -----------------------------------------------------

  test "entities are decoded rather than left as literal text" do
    assert_equal "AT&T said", ArticleText.from_html("<p>AT&amp;T&nbsp;said</p>")
  end

  test "a non-breaking space becomes a real space, which CGI.unescapeHTML alone does not do" do
    text = ArticleText.from_html("<p>10&nbsp;000 members</p>")

    assert_equal "10 000 members", text
    assert_not_includes text, "nbsp"
  end

  test "quote and angle entities are decoded" do
    assert_equal %(He said "no" to a < b), ArticleText.from_html("<p>He said &quot;no&quot; to a &lt; b</p>")
  end

  # --- the guarantee the tag pattern rests on --------------------------------

  # ContentSanitizer escapes ">" inside attribute values at ingest, so no
  # stored tag carries the character that would end the match early and spill
  # the rest of the tag into the text.
  test "an angle bracket inside an attribute does not spill markup into the text" do
    html = ContentSanitizer.sanitize(%(<p>Before</p><a title="x > y" href="https://e.example">link</a><p>After</p>))

    assert_equal "Before link After", ArticleText.from_html(html)
  end

  test "attribute values and tag names never become text" do
    html = '<div class="teaser"><a href="https://tracker.example/utm">click</a></div>'
    text = ArticleText.from_html(html)

    assert_equal "click", text
    assert_not_includes text, "href"
    assert_not_includes text, "tracker.example"
  end

  # --- whitespace and blanks -------------------------------------------------

  test "whitespace is collapsed so block markup does not become blank lines" do
    assert_equal "First line. Second line.",
      ArticleText.from_html("<p>First line.</p>\n\n<p>Second   line.</p>")
  end

  test "a blank or missing body yields an empty string" do
    assert_equal "", ArticleText.from_html(nil)
    assert_equal "", ArticleText.from_html("")
    assert_equal "", ArticleText.from_html("   ")
    assert_equal "", ArticleText.from_html("<p></p>")
  end

  test "plain text with no markup passes through squished" do
    assert_equal "Hello world", ArticleText.from_html("Hello   world")
  end
end
