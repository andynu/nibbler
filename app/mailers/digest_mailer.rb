# Sends daily digest emails with top unread articles.
#
# Articles are selected based on user preferences:
# - Only unread articles since last_digest_sent
# - Filtered by minimum score threshold (digest_min_score preference)
# - Ordered by score DESC, then date DESC
# - Limited to 20 articles maximum
class DigestMailer < ApplicationMailer
  # Default limit of articles to include in digest
  MAX_ARTICLES = 20

  # Send daily digest email to a user
  #
  # @param user [User] the user to send the digest to
  # @return [Mail::Message] the generated email
  def digest_email(user)
    @user = user
    @articles = fetch_digest_articles(user)

    return if @articles.empty?

    mail(
      to: email_address_with_name(user.email, user.full_name || user.login),
      subject: digest_subject(@articles.size)
    )
  end

  private

  # Fetch articles for the digest based on user preferences
  def fetch_digest_articles(user)
    min_score = user.user_preferences.find_by(pref_name: "digest_min_score")&.value&.to_i || 0
    last_sent = user.last_digest_sent || 1.day.ago

    user.user_entries
      .unread
      .joins(:entry)
      .includes(:entry, :feed)
      .where("entries.date_entered > ?", last_sent)
      .where("COALESCE(user_entries.score, 0) >= ?", min_score)
      .order("user_entries.score DESC NULLS LAST, entries.date_entered DESC")
      .limit(MAX_ARTICLES)
  end

  def digest_subject(article_count)
    if article_count == 1
      "Your Daily Digest - 1 new article"
    else
      "Your Daily Digest - #{article_count} new articles"
    end
  end
end
