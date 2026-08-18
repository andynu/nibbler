# Resolves the two bounds of the Fresh virtual folder: how far back it reaches
# and how many articles it keeps per feed.
#
# The window comes from the user's fresh_article_max_age preference (hours),
# optionally overridden per request by a fresh_max_age param of
# "week" / "month" / "all". The per-feed cap comes from the fresh_per_feed
# param. Shared by every endpoint that serves Fresh so they cannot drift apart.
module FreshArticleWindow
  extend ActiveSupport::Concern

  private

  # Cutoff from the user's fresh_article_max_age preference, in hours.
  def fresh_article_cutoff
    pref = current_user.user_preferences.find_by(pref_name: "fresh_article_max_age")
    hours = pref&.value&.to_i || 24
    hours.hours.ago
  end

  # Cutoff honouring an explicit max-age param, falling back to the preference.
  # Returns nil for "all", meaning no age limit at all.
  def fresh_article_cutoff_for_param(max_age_param)
    case max_age_param
    when "week"
      1.week.ago
    when "month"
      1.month.ago
    when "all"
      nil
    else
      fresh_article_cutoff
    end
  end

  # Per-feed cap for Fresh, as a positive Integer, or nil when the request asks
  # for no cap. Counters, entry lists and headlines all read the param through
  # here so the badge cannot count rows the list would drop.
  def fresh_per_feed_limit(per_feed_param)
    limit = per_feed_param.to_i
    limit.positive? ? limit : nil
  end
end
