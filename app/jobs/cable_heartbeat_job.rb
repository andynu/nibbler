# Broadcasts one HeartbeatChannel message to a user.
#
# The point is where it runs, not what it sends. Both development and production
# set good_job.execution_mode :external, so this executes in `bin/jobs` and not
# in Puma; a browser receiving the message is proof that the cable adapter
# carries a broadcast across process boundaries. Run it inline and it proves
# nothing, because an in-process adapter passes that test too.
#
#   bin/rails runner 'CableHeartbeatJob.perform_later(User.first.id)'
#
# Nothing enqueues this on a schedule. It is a diagnostic, reached for when push
# appears to have stopped, and the first thing to try before suspecting whatever
# channel is actually misbehaving.
class CableHeartbeatJob < ApplicationJob
  def perform(user_id)
    user = User.find_by(id: user_id)
    return unless user

    ActionCable.server.broadcast(
      HeartbeatChannel.stream_name_for(user),
      { at: Time.current.iso8601 }
    )
  end
end
