require "test_helper"

class CategoryTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
  end

  def category(title, parent: nil)
    @user.categories.create!(title: title, parent: parent)
  end

  test "requires a title" do
    assert_not @user.categories.new(title: "").valid?
  end

  test "accepts a parent that is not below it" do
    tech = category("Tech")
    news = category("News")

    news.parent = tech
    assert news.valid?
  end

  test "rejects itself as its own parent" do
    tech = category("Tech")

    tech.parent_id = tech.id

    assert_not tech.valid?
    assert_includes tech.errors.full_messages, "Parent cannot be the category itself"
  end

  test "rejects a direct child as its parent" do
    tech = category("Tech")
    ruby = category("Ruby", parent: tech)

    tech.parent = ruby

    assert_not tech.valid?
    assert_includes tech.errors.full_messages,
      "Parent cannot be one of this category's own descendants"
  end

  test "rejects a grandchild as its parent" do
    tech = category("Tech")
    programming = category("Programming", parent: tech)
    ruby = category("Ruby", parent: programming)

    tech.parent = ruby

    assert_not tech.valid?
  end

  test "descendant_ids collects every level below the category" do
    tech = category("Tech")
    programming = category("Programming", parent: tech)
    ruby = category("Ruby", parent: programming)
    news = category("News")

    assert_equal [ programming.id, ruby.id ].sort, tech.descendant_ids.sort
    assert_empty news.descendant_ids
  end

  test "descendant_ids terminates on a cycle already stored in the database" do
    tech = category("Tech")
    ruby = category("Ruby", parent: tech)
    # Past the validation, the way rows written before it exist.
    tech.update_column(:parent_id, ruby.id)

    assert_equal [ ruby.id ], tech.reload.descendant_ids
    assert_equal [ tech.id ], ruby.reload.descendant_ids
  end

  test "a new record with a parent is valid" do
    tech = category("Tech")

    assert @user.categories.new(title: "Ruby", parent: tech).valid?
  end
end
