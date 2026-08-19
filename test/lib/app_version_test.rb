require "test_helper"

class AppVersionTest < ActiveSupport::TestCase
  SHA = "b1aea9e61ca553976a0a5b3983539c338b683e99".freeze

  setup do
    @original_kamal_version = ENV["KAMAL_VERSION"]
    AppVersion.reset!
  end

  teardown do
    if @original_kamal_version.nil?
      ENV.delete("KAMAL_VERSION")
    else
      ENV["KAMAL_VERSION"] = @original_kamal_version
    end
    AppVersion.reset!
  end

  test "prefers KAMAL_VERSION, which is the only source available in production" do
    ENV["KAMAL_VERSION"] = SHA

    assert_equal SHA, AppVersion.sha
    assert AppVersion.known?
  end

  test "abbreviates to seven characters for display" do
    ENV["KAMAL_VERSION"] = SHA

    assert_equal "b1aea9e", AppVersion.short
    assert_equal AppVersion::SHORT_LENGTH, AppVersion.short.length
  end

  test "treats a blank KAMAL_VERSION as absent rather than as a version" do
    ENV["KAMAL_VERSION"] = "  "

    # Falls through to git in this checkout; the point is that it is not "  ".
    assert_not_equal "  ", AppVersion.sha
  end

  test "falls back to git when KAMAL_VERSION is absent" do
    ENV.delete("KAMAL_VERSION")

    # This suite runs inside the repository, so the fallback has a source.
    assert AppVersion.known?, "expected a SHA from git in a repository checkout"
    assert_match(/\A[0-9a-f]{40}\z/, AppVersion.sha)
  end

  test "reports UNKNOWN rather than raising when no source can supply a SHA" do
    ENV.delete("KAMAL_VERSION")
    AppVersion.stub(:from_git, nil) do
      AppVersion.reset!

      assert_equal AppVersion::UNKNOWN, AppVersion.sha
      assert_equal AppVersion::UNKNOWN, AppVersion.short
      assert_not AppVersion.known?
    end
  end

  test "memoizes so the git fallback does not shell out per call" do
    ENV.delete("KAMAL_VERSION")
    first = AppVersion.sha

    calls = 0
    AppVersion.stub(:from_git, -> { calls += 1; first }) do
      3.times { AppVersion.sha }
    end

    assert_equal 0, calls, "expected the memoized value, not repeated git invocations"
  end
end
