require "test_helper"

class TagMatcherTest < ActiveSupport::TestCase
  setup do
    @entry = entries(:basic)
  end

  test "matches a tag name in the title" do
    @entry.title = "Numbat Sightings Rise"

    assert TagMatcher.matches?(@entry, "numbat")
  end

  test "matches a tag name in the body" do
    @entry.content = "<p>A numbat appeared near the fence.</p>"

    assert TagMatcher.matches?(@entry, "Numbat")
  end

  test "does not match a substring of a longer word" do
    @entry.title = "Nothing here"
    @entry.content = "<p>The numbats were counted.</p>"

    assert_not TagMatcher.matches?(@entry, "numbat")
  end

  # A block that ends in punctuation survives strip_tags intact, because "." is
  # itself a word boundary. Pinned so the distinction below is not read as
  # applying to every boundary.
  test "a block ending in punctuation matches the word that follows it" do
    @entry.title = "Town Meeting"
    @entry.content = "<p>The vote failed.</p><p>Members left early.</p>"

    assert TagMatcher.matches?(@entry, "Members")
  end

  # The silent failure mode. A block ending in a letter -- a heading, a list
  # item, a table cell, an inline link, which is most of the markup a feed
  # sends -- welded to the next one, so the body read "QuokkaBilby" and neither
  # word had a boundary left to match on. The tag was then quietly not applied:
  # no error, no log line.
  test "a block ending in a letter still matches the word it contains" do
    @entry.title = "Town Meeting"
    @entry.content = "<ul><li>Quokka</li><li>Bilby</li></ul>"

    assert TagMatcher.matches?(@entry, "Quokka")
    assert TagMatcher.matches?(@entry, "Bilby")
  end

  # strip_tags leaves entities encoded, so a body that says "AT&T" still reads
  # "AT&amp;T" and a rule for the literal name never matches.
  test "an entity in the body does not hide the name it encodes" do
    @entry.title = "Carriers"
    @entry.content = "<p>AT&amp;T&nbsp;raised prices.</p>"

    assert TagMatcher.matches?(@entry, "AT&T")
    assert TagMatcher.matches?(@entry, "raised")
  end

  test "markup is never matched as content" do
    @entry.title = "Nothing here"
    @entry.content = '<a class="teaser" href="https://tracker.example/x">click</a>'

    assert_not TagMatcher.matches?(@entry, "teaser")
    assert_not TagMatcher.matches?(@entry, "href")
  end

  test "an entry with no body does not raise" do
    @entry.title = "Headline only"
    @entry.content = ""

    assert_not TagMatcher.matches?(@entry, "numbat")
  end
end
