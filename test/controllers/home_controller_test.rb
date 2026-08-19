require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "stamps the build SHA into a meta tag so a running instance can be identified" do
    get root_url

    assert_response :success
    assert_select "meta[name=?][content=?]", "app-version", AppVersion.sha
  end

  test "the version meta tag is readable without authenticating" do
    # The SPA gates itself through the API; the shell is public, which is what
    # makes `curl -s https://host | grep app-version` a usable deploy check.
    get root_url

    assert_response :success
    assert_select "meta[name=?]", "app-version", count: 1
  end
end
