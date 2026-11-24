# Runs a new entry's arrival work for a feed flagged fetch_full_text_on_arrival:
# the full article first, then the reader's filters and the feed's tags, so
# length, link-density and content rules see the whole article rather than the
# feed's excerpt.
#
# FeedUpdater skips its inline filter run for these feeds, so this job is the
# entry's only filter run. A fetch that raises is logged and the filters run on
# the excerpt: a lost filter run is worse than one made on less text.
#
# @see FeedUpdater#create_entry for the inline path unflagged feeds take
class ProcessArrivalJob < ApplicationJob
  queue_as :default

  # The entry was purged before the job ran; there is nothing to filter.
  discard_on ActiveRecord::RecordNotFound

  def perform(user_entry_id)
    user_entry = UserEntry.find(user_entry_id)

    fetch_full_text(user_entry.entry)
    user_entry.entry.reload

    FilterExecutor.execute(user_entry)
    FeedTagsForEntryApplier.apply(user_entry: user_entry)
  end

  private

  def fetch_full_text(entry)
    EntryFullText.for(entry)
  rescue StandardError => e
    Rails.logger.warn(
      "ProcessArrivalJob: full text fetch for entry #{entry.id} raised " \
      "#{e.class}: #{e.message}; filtering the feed's excerpt"
    )
  end
end
