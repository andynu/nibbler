require "test_helper"

class EntryTest < ActiveSupport::TestCase
  # A body is optional because headline-only and link-only items are a normal
  # RSS shape. nil is still rejected: the column is NOT NULL.
  test "is valid with no body at all" do
    assert_predicate build_entry(content: ""), :valid?
  end

  test "is invalid with a nil body" do
    entry = build_entry(content: nil)

    assert_not entry.valid?
    assert_includes entry.errors[:content], "can't be nil"
  end

  test "still requires a title" do
    assert_not build_entry(title: "").valid?
  end

  test "still requires a link" do
    assert_not build_entry(link: "").valid?
  end

  test "still requires a guid" do
    assert_not build_entry(guid: "").valid?
  end

  test "saves an entry that has no body" do
    entry = build_entry(content: "")

    assert_nothing_raised { entry.save! }
    assert_equal "", entry.reload.content
  end

  # These go through a real save and then a real Entry.search. Nothing here
  # assigns tsvector_combined or stubs the query: a test that did either would
  # have passed for the whole time the index was empty in production, which is
  # how the defect survived unnoticed.
  test "a saved entry is findable by a word from its title" do
    entry = build_entry(title: "Quokkas Return To Rottnest", content: "<p>Nothing to see.</p>")
    entry.save!

    assert_includes Entry.search("quokkas"), entry
  end

  test "a saved entry is findable by a word from its body" do
    entry = build_entry(title: "Nothing To See", content: "<p>The wombat burrow finally collapsed.</p>")
    entry.save!

    assert_includes Entry.search("wombat"), entry
  end

  test "a saved entry is not findable by a word it does not contain" do
    build_entry(title: "Quokkas Return To Rottnest", content: "<p>The wombat burrow.</p>").save!

    assert_empty Entry.search("platypus")
  end

  test "search stems, so a body word matches its inflections" do
    entry = build_entry(title: "Nothing To See", content: "<p>The quokka was photographed again.</p>")
    entry.save!

    assert_includes Entry.search("photograph"), entry
  end

  # The query used to be run through sanitize_sql_like on its way into the
  # tsquery, which escapes LIKE metacharacters for a statement that has no LIKE
  # in it. Dropping that call changes no result, because the text search parser
  # already treats _, % and \ as separators; this pins that so the escape cannot
  # come back as a bug fix. Re-measured against websearch_to_tsquery when the
  # parser was swapped: foo_bar, 50%, C_plus and back\slash still produce an
  # identical tsquery with and without the escaping.
  test "a query carrying LIKE metacharacters finds the entry that contains them" do
    entry = build_entry(title: "Nothing To See", content: "<p>The foo_bar branch is 50% merged.</p>")
    entry.save!

    assert_includes Entry.search("foo_bar"), entry
    assert_includes Entry.search("50%"), entry
  end

  # The query goes through websearch_to_tsquery, so the box accepts the three
  # operators that syntax carries: a leading hyphen excludes, double quotes ask
  # for adjacency, and a bare "or" alternates. The tests below are the whole
  # accepted grammar; anything not listed here is a bare word.

  test "a leading hyphen excludes entries that contain the term" do
    kept = build_entry(title: "Quokka Census Published", content: "<p>Numbers are up on Rottnest.</p>")
    kept.save!
    dropped = build_entry(title: "Quokka Census Delayed", content: "<p>The wombat survey took the budget.</p>")
    dropped.save!

    results = Entry.search("quokka -wombat")

    assert_includes results, kept
    assert_not_includes results, dropped
  end

  # The excluded half is stemmed like the included half, so an exclusion that
  # only matched the exact word the reader typed would leave inflections behind.
  test "an excluded term is stemmed too" do
    entry = build_entry(title: "Quokka Census", content: "<p>A study of the colony.</p>")
    entry.save!

    assert_includes Entry.search("quokka"), entry
    assert_empty Entry.search("quokka -studies")
  end

  test "a double-quoted phrase matches only where the words are adjacent" do
    adjacent = build_entry(title: "Field Notes", content: "<p>The wombat burrow collapsed.</p>")
    adjacent.save!
    apart = build_entry(title: "Field Notes", content: "<p>The wombat left and the burrow stayed.</p>")
    apart.save!

    results = Entry.search('"wombat burrow"')

    assert_includes results, adjacent
    assert_not_includes results, apart
  end

  test "a bare or matches either term" do
    quokka = build_entry(title: "Quokka Census", content: "<p>Nothing to see.</p>")
    quokka.save!
    wombat = build_entry(title: "Wombat Census", content: "<p>Nothing to see.</p>")
    wombat.save!

    results = Entry.search("quokka or wombat")

    assert_includes results, quokka
    assert_includes results, wombat
  end

  # The operators arrived by swapping plainto_tsquery for websearch_to_tsquery.
  # Both AND every bare word, and this is what pins that the swap did not turn
  # an ordinary two-word search into an OR behind the reader's back.
  test "a plain multi-word query still requires every word" do
    both = build_entry(title: "Quokka And Wombat Counted", content: "<p>Nothing to see.</p>")
    both.save!
    one = build_entry(title: "Quokka Counted", content: "<p>Nothing to see.</p>")
    one.save!

    results = Entry.search("quokka wombat")

    assert_includes results, both
    assert_not_includes results, one
  end

  # "-wombat" on its own is a valid tsquery that matches every article without
  # the word, which the GIN index cannot serve and which is not a search anyway.
  test "a query that only excludes matches nothing rather than nearly everything" do
    build_entry(title: "Quokka Census", content: "<p>Nothing to see.</p>").save!

    assert_empty Entry.search("-wombat")
    assert_empty Entry.search("-wombat -quokka")
  end

  test "recognises which queries name nothing to search for" do
    assert Entry.excludes_only?("-wombat")
    assert Entry.excludes_only?("-wombat -quokka")
    # An alternation reached through a negated branch is the same problem: the
    # branch matches every article the other one misses.
    assert Entry.excludes_only?("quokka or -wombat")

    assert_not Entry.excludes_only?("quokka -wombat")
    assert_not Entry.excludes_only?("quokka")
    assert_not Entry.excludes_only?("")
    # All stopwords, so the tsquery is empty. That matches nothing, which is a
    # legitimate answer and not the pure-negation case.
    assert_not Entry.excludes_only?("a -the")
  end

  test "editing the title reindexes the entry" do
    entry = build_entry(title: "Quokkas Return To Rottnest")
    entry.save!
    entry.update!(title: "Wombats Return To Rottnest")

    assert_empty Entry.search("quokkas")
    assert_includes Entry.search("wombats"), entry
  end

  test "editing the body reindexes the entry" do
    entry = build_entry(content: "<p>The quokka was photographed.</p>")
    entry.save!
    entry.update!(content: "<p>The wombat was photographed.</p>")

    assert_empty Entry.search("quokka")
    assert_includes Entry.search("wombat"), entry
  end

  # Rows written without going through the model -- fixtures, insert_all, a
  # psql session -- are indexed too, because PostgreSQL computes the column.
  test "an entry inserted below the model layer is still indexed" do
    Entry.insert_all!([ {
      guid: "entry-test-#{SecureRandom.hex(4)}",
      title: "Numbat Sightings Rise",
      link: "https://example.com/numbat",
      content: "<p>body</p>",
      content_hash: "hash-#{SecureRandom.hex(4)}",
      author: "",
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    } ])

    assert_equal [ "Numbat Sightings Rise" ], Entry.search("numbat").map(&:title)
  end

  # HTML markup is stripped before indexing, so attribute values and tag names
  # do not become search terms.
  test "html attributes and tag names are not indexed" do
    build_entry(content: '<a class="teaser" href="https://tracker.example/utm">click</a>').save!

    assert_empty Entry.search("href")
    assert_empty Entry.search("tracker.example")
  end

  # Adjacent block tags separate words. strip_tags in Ruby joined them into one
  # nonsense token ("<p>Hello</p><p>World</p>" -> "HelloWorld"), which indexed
  # neither word.
  test "words in adjacent tags are indexed separately" do
    entry = build_entry(content: "<p>Bilby</p><p>Bandicoot</p>")
    entry.save!

    assert_includes Entry.search("bilby"), entry
    assert_includes Entry.search("bandicoot"), entry
  end

  test "search orders more relevant entries first" do
    sparse = build_entry(title: "Nothing To See", content: "<p>A quokka appeared once.</p>")
    sparse.save!
    dense = build_entry(title: "Quokka Quokka Quokka", content: "<p>Quokka quokka quokka quokka.</p>")
    dense.save!

    assert_equal [ dense, sparse ], Entry.search("quokka").to_a
  end

  private

  def build_entry(**overrides)
    Entry.new({
      guid: "entry-test-#{SecureRandom.hex(4)}",
      title: "A Title",
      link: "https://example.com/article",
      content: "<p>body</p>",
      content_hash: "hash-#{SecureRandom.hex(4)}",
      author: "",
      updated: Time.current,
      date_entered: Time.current,
      date_updated: Time.current
    }.merge(overrides))
  end
end
