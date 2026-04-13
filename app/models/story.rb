# Represents a user-tracked news story composed of related articles and analyses.
#
# A Story is a named, user-owned subject (e.g. "SEC crypto regulation 2026") that
# aggregates articles discovered via one or more search queries, plus periodic
# analyses summarizing the story's state and progression.
#
# Stories can be seeded from an existing Entry (source_entry) when a user chooses
# to "track this story" from a feed article. The queries field holds a list of
# search query strings used to gather related articles over time.
#
# @see StoryArticle for individual articles collected for this story
# @see StoryAnalysis for periodic summarization/analysis records
class Story < ApplicationRecord
  STATUSES = %w[active concluded].freeze

  belongs_to :user
  belongs_to :source_entry, class_name: "Entry", optional: true

  has_many :story_articles, dependent: :destroy
  has_many :story_analyses, dependent: :destroy

  validates :name, presence: true
  validates :status, presence: true, inclusion: { in: STATUSES }

  scope :active, -> { where(status: "active") }
  scope :concluded, -> { where(status: "concluded") }

  def active?
    status == "active"
  end

  def concluded?
    status == "concluded"
  end

  def conclude!
    update!(status: "concluded", concluded_at: Time.current)
  end
end
