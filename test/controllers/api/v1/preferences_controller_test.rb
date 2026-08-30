require "test_helper"

class Api::V1::PreferencesControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  # Keys the reader writes that have no server-side default, so GET omits them
  # until the user has stored one. entries_sort_config is deliberately in this
  # set: a default would shadow the legacy entries_sort_by_score fallback the
  # client still honours (see the comment in PreferencesController).
  KEYS_WITHOUT_DEFAULTS = %w[entries_sort_config].freeze

  def setup
    @user = sign_in(users(:one))
  end

  def get_preferences
    get api_v1_preferences_url, as: :json
    assert_response :success
    JSON.parse(response.body)
  end

  def patch_preferences(payload)
    patch api_v1_preferences_url, params: payload, as: :json
    assert_response :success
    JSON.parse(response.body)
  end

  # --- Round trip -----------------------------------------------------------
  #
  # Each of these asserts the value survives a *re-GET*, not merely that PATCH
  # answered 200. PATCH has always answered 200 for keys it silently discarded,
  # which is how the loss went unnoticed.

  {
    "entries_sort_config" => "score:desc,feed:asc",
    "tts_playback_speed" => "1.5",
    "digest_enable" => "true",
    "digest_preferred_time" => "17:00",
    "digest_catchup" => "true",
    "digest_min_score" => "25"
  }.each do |key, value|
    test "PATCH then GET round-trips #{key}" do
      patched = patch_preferences(key => value)
      assert_equal value, patched[key], "PATCH response dropped #{key}"

      assert_equal value, get_preferences[key], "GET did not return the stored #{key}"
      assert_equal value, @user.user_preferences.find_by(pref_name: key)&.value,
                   "#{key} was not persisted"
    end
  end

  test "every key GET reports is writable and survives a re-GET" do
    # Guards against the two controller lists drifting apart again: anything the
    # API advertises as a preference must also be accepted by PATCH.
    defaults = get_preferences
    rewritten = defaults.transform_values { |value| "#{value}-changed" }

    patch_preferences(rewritten)

    assert_equal rewritten, get_preferences.slice(*rewritten.keys)
  end

  test "every preference the client declares is permitted by PATCH" do
    # The bug this test exists for: app/javascript/lib/api.ts declared keys the
    # controller never permitted, so writes were accepted and thrown away.
    client_keys = client_preference_keys
    assert_operator client_keys.size, :>=, 25, "failed to parse the client Preferences interface"

    payload = client_keys.index_with { |key| "roundtrip-#{key}" }
    patch_preferences(payload)

    stored = get_preferences
    missing = client_keys.reject { |key| stored[key] == payload[key] }
    assert_empty missing, "PATCH dropped client preference keys: #{missing.join(', ')}"
  end

  test "unknown keys are rejected rather than stored" do
    patch_preferences("not_a_preference" => "x")

    assert_nil @user.user_preferences.find_by(pref_name: "not_a_preference")
    assert_not_includes get_preferences.keys, "not_a_preference"
  end

  # --- Legacy sort fallback -------------------------------------------------

  test "GET omits entries_sort_config until the user stores one" do
    assert_not_includes get_preferences.keys, "entries_sort_config"
  end

  test "a legacy entries_sort_by_score user gets no entries_sort_config to shadow it" do
    @user.user_preferences.create!(pref_name: "entries_sort_by_score", value: "true")

    preferences = get_preferences

    assert_equal "true", preferences["entries_sort_by_score"]
    assert_not_includes preferences.keys, "entries_sort_config",
                        "a server default here would silently override the legacy score sort"
  end

  test "storing entries_sort_config does not disturb entries_sort_by_score" do
    @user.user_preferences.create!(pref_name: "entries_sort_by_score", value: "true")

    patch_preferences("entries_sort_config" => "date:asc")
    preferences = get_preferences

    assert_equal "date:asc", preferences["entries_sort_config"]
    assert_equal "true", preferences["entries_sort_by_score"]
  end

  test "keys without server defaults are the only ones GET can omit" do
    defaults = get_preferences

    KEYS_WITHOUT_DEFAULTS.each do |key|
      assert_not_includes defaults.keys, key
    end

    (client_preference_keys - KEYS_WITHOUT_DEFAULTS).each do |key|
      assert_includes defaults.keys, key, "GET has no default for #{key}"
    end
  end

  # --- The digest switch actually gates delivery -----------------------------
  #
  # Persistence is covered above and is not enough: digest_enable persisted
  # correctly while SendDigestsJob selected on users.email_digest, a column no
  # endpoint writes, so the switch moved a value nothing read. These two drive
  # the same endpoint the switch drives and then run the job, in both
  # directions, with the counterfactual asserted in each.

  test "turning the digest on through the API starts delivery" do
    users(:one).update!(email: "digest@example.com", last_digest_sent: nil)

    patch_preferences("digest_preferred_time" => current_hour)
    assert_no_emails { SendDigestsJob.perform_now }

    patch_preferences("digest_enable" => "true")

    assert_emails 1 do
      SendDigestsJob.perform_now
    end
  end

  test "turning the digest off through the API stops delivery" do
    user = users(:one)
    user.update!(email: "digest@example.com", last_digest_sent: nil)

    patch_preferences("digest_enable" => "true", "digest_preferred_time" => current_hour)
    assert_emails 1 do
      SendDigestsJob.perform_now
    end

    # Clear the 23-hour guard so the switch is the only thing that can stop the
    # next run.
    user.update!(last_digest_sent: nil)
    patch_preferences("digest_enable" => "false")

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  # --- Isolation ------------------------------------------------------------

  test "preferences are scoped to the signed-in user" do
    patch_preferences("tts_playback_speed" => "2")

    sign_in(users(:two))

    assert_equal "1", get_preferences["tts_playback_speed"]
  end

  private

  # The hour SendDigestsJob is running in, in the format digest_preferred_time
  # stores.
  def current_hour
    Time.current.strftime("%H:00")
  end

  # Field names from the Preferences interface in the TypeScript client. Parsed
  # rather than duplicated so the two sides cannot drift silently.
  def client_preference_keys
    source = Rails.root.join("app/javascript/lib/api.ts").read
    body = source[/export interface Preferences \{(.*?)\n\}/m, 1]
    raise "could not find the Preferences interface in app/javascript/lib/api.ts" if body.nil?

    body.scan(/^\s{2}(\w+)\??:\s/).flatten
  end
end
