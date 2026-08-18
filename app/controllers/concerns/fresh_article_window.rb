# Resolves the age cutoff for the Fresh virtual folder.
#
# The window comes from the user's fresh_article_max_age preference (hours),
# optionally overridden per request by a fresh_max_age param of
# "week" / "month" / "all". Shared by every endpoint that serves Fresh so they
# cannot drift apart.
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
end
