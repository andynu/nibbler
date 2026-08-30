# Proof of life for the push stack, per signed-in user.
#
# Not Action Cable's protocol ping: that only proves the socket between a tab
# and Puma is open. A message on this channel has travelled the whole path a
# real broadcast takes -- broadcast in the GoodJob worker process, through the
# cable database, out of the web process's solid_cable listener thread, to the
# browser. That is the path an in-process adapter breaks without raising
# anything, so there is one channel whose only job is to make it observable.
#
# The stream is per user rather than global so a heartbeat aimed at one session
# cannot be read as evidence that another user's connection works.
class HeartbeatChannel < ApplicationCable::Channel
  def self.stream_name_for(user)
    "heartbeat:#{user.id}"
  end

  def subscribed
    stream_from self.class.stream_name_for(current_user)
  end
end
