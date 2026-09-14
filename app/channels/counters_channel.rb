# Tells a signed-in user's open tabs that their unread counts have moved.
#
# The message is a nudge, not the numbers: a client that receives one refetches
# GET /api/v1/counters. The Fresh count depends on the fresh_max_age and
# fresh_per_feed selectors each tab sends as query params, so the broadcasting
# process cannot compute what any given tab displays, and pushing figures would
# make this a second source of truth for the ones it could.
#
# The stream is keyed on the connection's user and the subscription takes no
# params, so a client has no way to name someone else's stream.
#
# @see UpdateFeedJob for the process that broadcasts here
class CountersChannel < ApplicationCable::Channel
  def self.stream_name_for(user)
    "counters:#{user.id}"
  end

  # @param user [User] whose counts moved
  def self.broadcast_stale(user)
    ActionCable.server.broadcast(stream_name_for(user), { stale: true })
  end

  def subscribed
    stream_from self.class.stream_name_for(current_user)
  end
end
