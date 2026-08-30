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

  # The query used to be run through sanitize_sql_like on its way to
  # plainto_tsquery, which escapes LIKE metacharacters for a statement that has
  # no LIKE in it. Dropping that call changes no result, because the text search
  # parser already treats _, % and \ as separators; this pins that so the escape
  # cannot come back as a bug fix.
  test "a query carrying LIKE metacharacters finds the entry that contains them" do
    entry = build_entry(title: "Nothing To See", content: "<p>The foo_bar branch is 50% merged.</p>")
    entry.save!

    assert_includes Entry.search("foo_bar"), entry
    assert_includes Entry.search("50%"), entry
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
