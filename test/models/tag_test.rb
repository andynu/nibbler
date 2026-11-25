require "test_helper"

class TagTest < ActiveSupport::TestCase
  setup do
    @user = users(:one)
  end

  test "is left out of the morning paper with a limit of five by default" do
    tag = @user.tags.create!(name: "ruby")

    assert_not tag.include_in_paper
    assert_equal 5, tag.paper_limit
  end

  test "accepts a positive paper limit" do
    assert @user.tags.new(name: "ruby", paper_limit: 1).valid?
  end

  test "rejects a paper limit of zero or less" do
    [ 0, -3 ].each do |limit|
      tag = @user.tags.new(name: "ruby", paper_limit: limit)

      assert_not tag.valid?, "paper_limit #{limit} should be invalid"
      assert_includes tag.errors[:paper_limit], "must be greater than 0"
    end
  end

  test "rejects a fractional or missing paper limit" do
    assert_not @user.tags.new(name: "ruby", paper_limit: 2.5).valid?
    assert_not @user.tags.new(name: "ruby", paper_limit: nil).valid?
  end
end
