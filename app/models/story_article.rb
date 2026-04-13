# Represents an individual article collected for a Story.
#
# StoryArticles are gathered via a story's configured search queries and deduped
# by (story_id, url). They capture the minimal article metadata needed to present
# the story timeline without re-fetching source pages.
#
# @see Story for the parent story aggregating these articles
# @see StoryAnalysis for analyses that reference these articles by id
class StoryArticle < ApplicationRecord
  belongs_to :story

  validates :url, presence: true, uniqueness: { scope: :story_id }
end
