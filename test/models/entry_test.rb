require "test_helper"

class EntryTest < ActiveSupport::TestCase
  # A body is optional because headline-only and link-only items are a normal
  # RSS shape. nil is still rejected: the column is NOT NULL and the tsvector
  # callback reads the value on every save.
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
