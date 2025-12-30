# Job that sends daily email digests to users at their preferred time.
# Runs hourly via GoodJob cron and checks which users should receive digests.
#
# Users receive a digest when:
# - email is present and valid
# - email_digest is true
# - digest_preferred_time matches current hour (default: 8:00 AM)
# - last_digest_sent is nil or > 23 hours ago
class SendDigestsJob < ApplicationJob
  queue_as :default

  # Default preferred time if user hasn't set one (8:00 AM)
  DEFAULT_PREFERRED_TIME = "08:00"

  def perform
    users_due_for_digest.find_each do |user|
      send_digest_to_user(user)
    rescue StandardError => e
      Rails.logger.error("Failed to send digest to user #{user.id}: #{e.message}")
    end
  end

  private

  def users_due_for_digest
    current_hour = Time.current.strftime("%H")
    default_hour = DEFAULT_PREFERRED_TIME[0, 2]

    User
      .where.not(email: [ nil, "" ])
      .where(email_digest: true)
      .where(digest_time_matches_sql, current_hour, default_hour, current_hour)
      .where("last_digest_sent IS NULL OR last_digest_sent < ?", 23.hours.ago)
  end

  def digest_time_matches_sql
    # Check if user's preferred time hour matches current hour
    # Uses the digest_preferred_time user preference, defaults to 08:00
    <<~SQL.squish
      (
        EXISTS (
          SELECT 1 FROM user_preferences up
          WHERE up.user_id = users.id
            AND up.pref_name = 'digest_preferred_time'
            AND SUBSTRING(up.value FROM 1 FOR 2) = ?
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM user_preferences up
            WHERE up.user_id = users.id AND up.pref_name = 'digest_preferred_time'
          )
          AND ? = ?
        )
      )
    SQL
  end

  def send_digest_to_user(user)
    # Generate and send the email
    mail = DigestMailer.digest_email(user)

    # NullMail returned when no articles to send
    return if mail.is_a?(ActionMailer::Base::NullMail)

    mail.deliver_now

    # Update last_digest_sent timestamp
    user.update!(last_digest_sent: Time.current)

    # Mark articles as read if digest_catchup is enabled
    mark_articles_read_if_catchup_enabled(user)

    Rails.logger.info("Sent digest to user #{user.id} (#{user.email})")
  end

  def mark_articles_read_if_catchup_enabled(user)
    catchup_enabled = user.user_preferences
      .find_by(pref_name: "digest_catchup")
      &.value == "true"

    return unless catchup_enabled

    # Mark all unread articles as read
    user.user_entries.unread.update_all(unread: false, last_read: Time.current)
    Rails.logger.info("Marked articles as read for user #{user.id} (digest_catchup enabled)")
  end
end
