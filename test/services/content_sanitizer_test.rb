require "test_helper"

class ContentSanitizerTest < ActiveSupport::TestCase
  # ===================
  # Nil/Blank Input
  # ===================

  test "returns empty string for nil input" do
    assert_equal "", ContentSanitizer.sanitize(nil)
  end

  test "returns empty string for blank input" do
    assert_equal "", ContentSanitizer.sanitize("")
    assert_equal "", ContentSanitizer.sanitize("   ")
  end

  # ===================
  # Dangerous Tags Removed WITH Content
  # ===================

  test "strips script tags and their content" do
    html = '<p>Safe</p><script>alert("xss")</script><p>Also safe</p>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "Safe"
    assert_includes result, "Also safe"
    assert_not_includes result, "script"
    assert_not_includes result, "alert"
    assert_not_includes result, "xss"
  end

  test "strips style tags and their content" do
    html = "<p>Content</p><style>body { display: none; }</style>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "Content"
    assert_not_includes result, "style"
    assert_not_includes result, "display"
    assert_not_includes result, "none"
  end

  test "strips noscript tags and their content" do
    html = "<p>Main</p><noscript><p>Fallback content</p></noscript>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "Main"
    assert_not_includes result, "noscript"
    assert_not_includes result, "Fallback"
  end

  test "strips template tags and their content" do
    html = "<p>Visible</p><template><div>Hidden template</div></template>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "Visible"
    assert_not_includes result, "template"
    assert_not_includes result, "Hidden"
  end

  # ===================
  # Allowed Formatting Tags Preserved
  # ===================

  test "preserves paragraph tags" do
    html = "<p>Hello world</p>"
    result = ContentSanitizer.sanitize(html)

    assert_equal "<p>Hello world</p>", result
  end

  test "preserves div tags" do
    html = "<div>Content here</div>"
    result = ContentSanitizer.sanitize(html)

    assert_equal "<div>Content here</div>", result
  end

  test "preserves anchor tags with href" do
    html = '<a href="https://example.com">Link</a>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<a"
    assert_includes result, 'href="https://example.com"'
    assert_includes result, "Link</a>"
  end

  test "preserves img tags with allowed attributes" do
    html = '<img src="https://example.com/image.jpg" alt="Description" width="100">'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<img"
    assert_includes result, 'src="https://example.com/image.jpg"'
    assert_includes result, 'alt="Description"'
    assert_includes result, 'width="100"'
  end

  test "preserves formatting tags like strong, em, code" do
    html = "<p><strong>Bold</strong> <em>italic</em> <code>code</code></p>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<strong>Bold</strong>"
    assert_includes result, "<em>italic</em>"
    assert_includes result, "<code>code</code>"
  end

  test "preserves heading tags" do
    html = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<h1>Title</h1>"
    assert_includes result, "<h2>Subtitle</h2>"
    assert_includes result, "<h3>Section</h3>"
  end

  test "preserves list tags" do
    html = "<ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<ul>"
    assert_includes result, "<li>One</li>"
    assert_includes result, "<ol>"
  end

  test "preserves blockquote and pre tags" do
    html = '<blockquote cite="source">Quote</blockquote><pre>Code block</pre>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<blockquote"
    assert_includes result, "Quote</blockquote>"
    assert_includes result, "<pre>Code block</pre>"
  end

  test "preserves table structure" do
    html = "<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<table>"
    assert_includes result, "<thead>"
    assert_includes result, "<th>Header</th>"
    assert_includes result, "<td>Cell</td>"
  end

  # ===================
  # Attribute Filtering
  # ===================

  test "removes onclick and other event handlers" do
    html = '<p onclick="evil()">Click me</p>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<p>"
    assert_includes result, "Click me"
    assert_not_includes result, "onclick"
    assert_not_includes result, "evil"
  end

  test "removes onmouseover event handler" do
    html = '<div onmouseover="steal()">Hover</div>'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "onmouseover"
    assert_not_includes result, "steal"
    assert_includes result, "<div>"
    assert_includes result, "Hover"
  end

  test "removes onerror event handler" do
    html = '<img src="x" onerror="evil()">'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "onerror"
    assert_not_includes result, "evil"
  end

  test "removes disallowed attributes from tags" do
    html = '<p data-tracking="abc123" style="color:red">Text</p>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<p"
    assert_includes result, "Text"
    assert_not_includes result, "data-tracking"
    assert_not_includes result, "style"
  end

  test "preserves allowed global attributes" do
    html = '<p class="intro" id="first" title="Tooltip">Content</p>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, 'class="intro"'
    assert_includes result, 'id="first"'
    assert_includes result, 'title="Tooltip"'
  end

  # ===================
  # URL Sanitization
  # ===================

  test "removes javascript: URLs from href" do
    html = '<a href="javascript:alert(1)">Link</a>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<a"
    assert_includes result, "Link"
    assert_not_includes result, "javascript:"
    assert_not_includes result.downcase, "href="
  end

  test "removes javascript: URLs from src" do
    html = '<img src="javascript:evil()">'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "javascript:"
  end

  test "allows data:image/ URLs in src" do
    html = '<img src="data:image/png;base64,iVBORw0KG...">'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<img"
    assert_includes result, "data:image/png;base64"
  end

  test "removes non-image data: URLs" do
    html = '<a href="data:text/html,<script>evil()</script>">Link</a>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<a"
    assert_not_includes result, "data:text/html"
  end

  test "allows regular https URLs" do
    html = '<a href="https://example.com/page"><img src="https://example.com/img.jpg"></a>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, 'href="https://example.com/page"'
    assert_includes result, 'src="https://example.com/img.jpg"'
  end

  # ===================
  # Iframe Whitelist
  # ===================

  test "allows YouTube embeds" do
    html = '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<iframe"
    assert_includes result, "youtube.com/embed"
  end

  test "allows YouTube no-cookie embeds" do
    html = '<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<iframe"
    assert_includes result, "youtube-nocookie.com"
  end

  test "allows Vimeo embeds" do
    html = '<iframe src="https://player.vimeo.com/video/12345"></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<iframe"
    assert_includes result, "vimeo.com"
  end

  test "allows Spotify embeds" do
    html = '<iframe src="https://open.spotify.com/embed/track/xyz"></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<iframe"
    assert_includes result, "spotify.com"
  end

  test "removes iframes from non-whitelisted sources" do
    html = '<iframe src="https://evil.com/tracker"></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "<iframe"
    assert_not_includes result, "evil.com"
  end

  test "removes iframes with no src" do
    html = "<iframe></iframe>"
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "<iframe"
  end

  test "removes iframes with blank src" do
    html = '<iframe src=""></iframe>'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "<iframe"
  end

  # ===================
  # Disallowed Tags
  # ===================

  test "removes form tags" do
    html = '<form action="/steal"><input type="text"></form>'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "<form"
    assert_not_includes result, "<input"
  end

  test "removes object and embed tags" do
    html = '<object data="evil.swf"></object><embed src="bad.swf">'
    result = ContentSanitizer.sanitize(html)

    assert_not_includes result, "<object"
    assert_not_includes result, "<embed"
  end

  # ===================
  # Class Method
  # ===================

  test "class method sanitize works" do
    html = "<p>Test</p><script>evil()</script>"
    result = ContentSanitizer.sanitize(html)

    assert_includes result, "<p>Test</p>"
    assert_not_includes result, "script"
  end

  # ===================
  # Complex Real-World Examples
  # ===================

  test "handles complex RSS content with mixed safe and unsafe elements" do
    html = <<~HTML
      <div class="article">
        <h1>Article Title</h1>
        <p onclick="track()">Intro paragraph with <a href="https://example.com">link</a>.</p>
        <script>trackPageView();</script>
        <blockquote>A thoughtful quote</blockquote>
        <img src="https://example.com/photo.jpg" onerror="alert(1)">
        <iframe src="https://www.youtube.com/embed/abc123"></iframe>
        <iframe src="https://malicious.com/tracker"></iframe>
        <style>.hidden { display: none; }</style>
      </div>
    HTML

    result = ContentSanitizer.sanitize(html)

    # Safe content preserved
    assert_includes result, "<h1>Article Title</h1>"
    assert_includes result, "Intro paragraph"
    assert_includes result, 'href="https://example.com"'
    assert_includes result, "A thoughtful quote"
    assert_includes result, 'src="https://example.com/photo.jpg"'
    assert_includes result, "youtube.com/embed"

    # Dangerous content removed
    assert_not_includes result, "onclick"
    assert_not_includes result, "script"
    assert_not_includes result, "trackPageView"
    assert_not_includes result, "onerror"
    assert_not_includes result, "malicious.com"
    assert_not_includes result, "style"
    assert_not_includes result, ".hidden"
  end
end
