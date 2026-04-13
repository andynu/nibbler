# Represents a point-in-time analysis of a Story's current state.
#
# StoryAnalyses are produced periodically (e.g. after new articles arrive) and
# capture whether the story has a new development, whether it appears concluded,
# a human-readable timeline label, a summary, and the model's rationale. The
# article_ids jsonb array references the StoryArticle ids this analysis drew from.
#
# @see Story for the parent story
# @see StoryArticle for the articles referenced by article_ids
class StoryAnalysis < ApplicationRecord
  belongs_to :story

  scope :recent, -> { order(created_at: :desc) }
end
