# Records when a feed's current failing streak began.
#
# feeds.consecutive_failures already counts attempts, but a count on its own
# cannot separate the two cases a reader actually needs to tell apart. Forty
# failures is either a host that has been flapping since lunchtime or a domain
# that stopped resolving in March, and the count reads identically for both.
# The timestamp is what makes "failing for 3 weeks" sayable in the UI.
#
# Nullable with no default and no backfill on purpose. NULL means "not currently
# failing", which is the truthful state for every existing row: nothing has been
# incrementing consecutive_failures on the fetch-error path, so there is no
# historical streak to date. The column starts filling in from the first failure
# after this deploys, and Feed#reset_backoff! clears it again on any success.
#
# Additive and reversible. Nothing reads the column until the code that writes
# it ships, so deploy order does not matter.
class AddFirstFailedAtToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :first_failed_at, :datetime
  end
end
