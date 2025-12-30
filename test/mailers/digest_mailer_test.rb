require "test_helper"

class DigestMailerTest < ActionMailer::TestCase
  setup do
    @user = users(:one)
    @user.update!(email: "digest@example.com", email_digest: true)
  end

  test "digest_email generates email with articles" do
    email = DigestMailer.digest_email(@user)

    assert_emails 1 do
      email.deliver_now
    end

    assert_equal [ "digest@example.com" ], email.to
    assert_match(/Your Daily Digest/, email.subject)
  end

  test "digest_email includes article count in subject" do
    email = DigestMailer.digest_email(@user)

    # Should have at least one unread article from fixtures
    assert_match(/\d+ new article/, email.subject)
  end

  test "digest_email contains article title in HTML body" do
    email = DigestMailer.digest_email(@user)
    html_body = email.html_part.body.to_s

    # Check for article content from fixture
    assert_match(/Test Entry/, html_body)
  end

  test "digest_email contains article title in text body" do
    email = DigestMailer.digest_email(@user)
    text_body = email.text_part.body.to_s

    assert_match(/Test Entry/, text_body)
  end

  test "digest_email includes feed name" do
    email = DigestMailer.digest_email(@user)
    html_body = email.html_part.body.to_s

    assert_match(/High Frequency Feed/, html_body)
  end

  test "digest_email includes score badge for scored articles" do
    email = DigestMailer.digest_email(@user)
    html_body = email.html_part.body.to_s

    # The fixture has score: 3
    assert_match(/Score: 3/, html_body)
  end

  test "digest_email includes unsubscribe link" do
    email = DigestMailer.digest_email(@user)
    html_body = email.html_part.body.to_s

    assert_match(/unsubscribe/, html_body.downcase)
  end

  test "digest_email skips delivery when no articles" do
    # Mark all entries as read
    @user.user_entries.update_all(unread: false)

    assert_no_emails do
      DigestMailer.digest_email(@user).deliver_now
    end
  end

  test "digest_email respects min_score preference" do
    # Set min_score to 5, which excludes the fixture article with score 3
    @user.user_preferences.create!(pref_name: "digest_min_score", value: "5")

    assert_no_emails do
      DigestMailer.digest_email(@user).deliver_now
    end
  end

  test "digest_email respects last_digest_sent" do
    # Set last_digest_sent to future, which should exclude all entries
    @user.update!(last_digest_sent: 1.day.from_now)

    assert_no_emails do
      DigestMailer.digest_email(@user).deliver_now
    end
  end
end
