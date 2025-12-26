# Represents an RSS or Atom feed subscription.
#
# Feeds are the source of articles (entries) in the system. Each feed belongs to
# a user and optionally to a category for organization. Feeds support hierarchical
# structure through parent_feed relationships.
#
# The feed_url is unique per user, allowing different users to subscribe to the
# same feed independently. Feeds track their last update time to support polling
# for new content.
#
# @see Entry for individual articles from this feed
# @see Category for feed organization
# @see UserEntry for the per-user view of entries from this feed
class Feed < ApplicationRecord
  belongs_to :user
  belongs_to :category, optional: true
  belongs_to :parent_feed, class_name: "Feed", optional: true
  has_many :child_feeds, class_name: "Feed", foreign_key: :parent_feed_id, dependent: :nullify
  has_many :user_entries, dependent: :destroy
  has_many :entries, through: :user_entries

  validates :title, presence: true
  validates :feed_url, presence: true
  validates :feed_url, uniqueness: { scope: :user_id }

  scope :visible, -> { where(hidden: false) }
  scope :ordered, -> { order(:order_id, :title) }
  scope :needs_update, -> { where("last_updated IS NULL OR last_updated < ?", 30.minutes.ago) }
end
