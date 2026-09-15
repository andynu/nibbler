# Counts failed updates that were nibbler's fault rather than the feed's: a
# database error while storing a fetch the feed's server served successfully.
#
# These back a feed off like any other failure, but must not touch
# consecutive_failures or first_failed_at, which decide Feed#broken? and so have
# to describe the feed's own server. Without a count of their own, a fault that
# persists on our side could only retry at a flat interval.
#
# Additive, with a constant default, so no existing row needs a backfill. Run it
# before the code ships: Feed#reset_backoff! reads the column on every
# successful poll.
class AddInfrastructureFailuresToFeeds < ActiveRecord::Migration[8.1]
  def change
    add_column :feeds, :infrastructure_failures, :integer, default: 0, null: false
  end
end
