# Scheduler job that purges old articles based on user preferences.
# Runs daily at 3am via GoodJob cron.
#
# For each user with purging enabled (purge_old_days > 0):
# - Removes user_entries older than their purge_old_days setting
# - Respects per-feed purge_interval overrides
# - Never purges starred (marked) or published articles
# - Only purges unread articles if purge_unread_articles is true
# - Cleans up orphaned entries with no remaining user_entries
class PurgeArticlesJob < ApplicationJob
  queue_as :default

  def perform
    Rails.logger.info "[PurgeArticlesJob] Starting article purge"

    users_to_purge.find_each do |user|
      purge_for_user(user)
    end

    cleanup_orphaned_entries

    Rails.logger.info "[PurgeArticlesJob] Completed article purge"
  end

  private

  def users_to_purge
    # Find users who have purging enabled (purge_old_days > 0)
    User.joins(:user_preferences)
        .where(user_preferences: { pref_name: "purge_old_days" })
        .where.not(user_preferences: { value: "0" })
        .where.not(user_preferences: { value: "" })
        .distinct
  end

  def purge_for_user(user)
    prefs = user.user_preferences.pluck(:pref_name, :value).to_h
    purge_days = prefs["purge_old_days"]&.to_i || 60
    purge_unread = prefs["purge_unread_articles"] == "true"

    return if purge_days.zero?

    cutoff_date = purge_days.days.ago

    # Build base query for user entries to delete
    entries_to_purge = user.user_entries
      .joins(:entry)
      .where("entries.date_entered < ?", cutoff_date)
      .where(marked: false)  # Never purge starred
      .where(published: false)  # Never purge published

    # Only purge read articles unless purge_unread is enabled
    entries_to_purge = entries_to_purge.where(unread: false) unless purge_unread

    # Apply per-feed purge_interval overrides
    # Feeds with purge_interval > 0 use their own setting
    entries_with_feed_override = entries_to_purge
      .joins("INNER JOIN feeds ON feeds.id = user_entries.feed_id")
      .where("feeds.purge_interval > 0")
      .where("entries.date_entered < NOW() - (feeds.purge_interval || ' days')::interval")

    entries_without_override = entries_to_purge
      .left_joins(:feed)
      .where("feeds.id IS NULL OR feeds.purge_interval = 0")

    # Count for logging
    count_with_override = entries_with_feed_override.count
    count_without_override = entries_without_override.count
    total = count_with_override + count_without_override

    if total > 0
      Rails.logger.info "[PurgeArticlesJob] Purging #{total} articles for user #{user.id}"
      entries_with_feed_override.delete_all
      entries_without_override.delete_all
    end
  end

  def cleanup_orphaned_entries
    # Delete entries that have no user_entries referencing them
    orphaned = Entry.left_joins(:user_entries)
                    .where(user_entries: { id: nil })

    count = orphaned.count
    if count > 0
      Rails.logger.info "[PurgeArticlesJob] Cleaning up #{count} orphaned entries"
      orphaned.delete_all
    end
  end
end
