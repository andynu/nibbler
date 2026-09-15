# Records when nibbler stopped fetching a feed because the feed's own server
# had been failing for a year without a single success.
#
# A timestamp rather than a flag, so the UI can say when checking stopped, and
# stored rather than derived from first_failed_at, so a later change to the
# one-year threshold does not retroactively stop or restart existing feeds.
#
# Nullable with no default and no backfill. NULL means "still being checked",
# the truthful state for every existing row. Run it before the code ships: the
# scheduler filters on the column and Feed#reset_backoff! reads it.
class AddDeadAtToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :dead_at, :datetime
  end
end
