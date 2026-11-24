# Fetches the full article for an entry that has just been published, so the
# public feed can carry the whole text rather than the feed's excerpt.
#
# EntryFullText.for owns the fetch, its politeness and its failure memory; a
# failed fetch is a returned row, not an exception, and the feed then falls
# back to the excerpt through Entry#readable_content.
#
# @see UserEntry#enqueue_full_text_fetch for when this is enqueued
class FetchFullTextJob < ApplicationJob
  queue_as :default

  # The entry was purged between publish and perform; there is nothing to fetch.
  discard_on ActiveRecord::RecordNotFound

  def perform(entry_id)
    EntryFullText.for(Entry.find(entry_id))
  end
end
