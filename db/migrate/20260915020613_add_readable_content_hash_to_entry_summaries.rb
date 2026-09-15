# A digest of the text a summary was actually written from.
#
# entry_summaries.content_hash copies entries.content_hash, a digest of what the
# feed sent, but EntrySummarizer reads Entry#readable_content, which is the
# fetched article when there is one. This records that document instead, so a
# summary of an excerpt goes stale when a longer copy arrives behind it.
#
# Nullable with no backfill: a row written before this column keeps comparing
# against entries.content_hash (see EntrySummary#valid_for_content?) until it is
# regenerated.
class AddReadableContentHashToEntrySummaries < ActiveRecord::Migration[8.1]
  def change
    add_column :entry_summaries, :readable_content_hash, :string
  end
end
