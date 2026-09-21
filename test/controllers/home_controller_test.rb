require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "stamps the build SHA into a meta tag so a running instance can be identified" do
    get root_url

    assert_response :success
    assert_select "meta[name=?][content=?]", "app-version", AppVersion.sha
  end

  test "the layout links the compiled stylesheet and not the Tailwind source" do
    # `stylesheet_link_tag :app` links every css on the asset load path. The
    # Tailwind source starts with `@import "tailwindcss"`, which a browser
    # resolves against /assets/tailwindcss and gets a 404, so the source is
    # kept off the load path (config/application.rb).
    get root_url

    assert_response :success
    assert_select "link[rel=stylesheet]", count: 1
    assert_select "link[rel=stylesheet][href^=?]", "/assets/application-"
  end

  test "the version meta tag is readable without authenticating" do
    # The SPA gates itself through the API; the shell is public, which is what
    # makes `curl -s https://host | grep app-version` a usable deploy check.
    get root_url

    assert_response :success
    assert_select "meta[name=?]", "app-version", count: 1
  end
end
