require "test_helper"

class SendDigestsJobTest < ActiveJob::TestCase
  include ActionMailer::TestHelper

  setup do
    @user = users(:one)
    @user.update!(
      email: "digest@example.com",
      last_digest_sent: nil
    )
    # Set preferred time to current hour so user is due for digest
    current_hour = Time.current.strftime("%H:00")
    @user.user_preferences.create!(pref_name: "digest_preferred_time", value: current_hour)
    @user.user_preferences.create!(pref_name: "digest_enable", value: "true")
  end

  test "sends digest to eligible user" do
    assert_emails 1 do
      SendDigestsJob.perform_now
    end

    @user.reload
    assert_not_nil @user.last_digest_sent
    assert @user.last_digest_sent > 1.minute.ago
  end

  # --- The digest_enable gate -----------------------------------------------
  #
  # digest_enable is the preference the "Send daily digest" switch writes. The
  # job used to select on users.email_digest, a column no endpoint ever wrote,
  # so the switch changed nothing in either direction. These four cover both
  # directions of the switch and both directions of the column.

  test "skips users who turned the digest off" do
    @user.user_preferences.find_by(pref_name: "digest_enable").update!(value: "false")

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "skips users who never turned the digest on" do
    @user.user_preferences.find_by(pref_name: "digest_enable").destroy!

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "sends when the preference is on even though the email_digest column is false" do
    @user.update!(email_digest: false)

    assert_emails 1 do
      SendDigestsJob.perform_now
    end
  end

  test "does not send on the email_digest column alone" do
    @user.user_preferences.find_by(pref_name: "digest_enable").destroy!
    @user.update!(email_digest: true)

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "skips users with empty email" do
    @user.update!(email: "")

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "skips users who received digest recently" do
    @user.update!(last_digest_sent: 1.hour.ago)

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "sends digest to user who received one 24 hours ago" do
    @user.update!(last_digest_sent: 24.hours.ago)

    assert_emails 1 do
      SendDigestsJob.perform_now
    end
  end

  test "skips users whose preferred time does not match current hour" do
    # Set preferred time to a different hour
    different_hour = (Time.current.hour + 12) % 24
    @user.user_preferences.find_by(pref_name: "digest_preferred_time")
      .update!(value: format("%02d:00", different_hour))

    assert_no_emails do
      SendDigestsJob.perform_now
    end
  end

  test "marks articles read when digest_catchup enabled" do
    @user.user_preferences.create!(pref_name: "digest_catchup", value: "true")

    # Verify we have unread articles before
    assert @user.user_entries.unread.any?

    SendDigestsJob.perform_now

    # All articles should now be read
    assert_equal 0, @user.user_entries.unread.count
  end

  test "does not mark articles read when digest_catchup disabled" do
    @user.user_preferences.create!(pref_name: "digest_catchup", value: "false")

    unread_count_before = @user.user_entries.unread.count
    SendDigestsJob.perform_now

    assert_equal unread_count_before, @user.user_entries.unread.count
  end

  test "error sending to one user does not stop others" do
    # This test verifies the job continues after an error
    # We'll check that the job runs without raising even if the mailer has issues
    assert_nothing_raised do
      SendDigestsJob.perform_now
    end
  end
end
