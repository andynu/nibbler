require "test_helper"

class CableHeartbeatJobTest < ActiveSupport::TestCase
  include ActionCable::TestHelper

  test "broadcasts to the user's heartbeat stream" do
    assert_broadcasts(HeartbeatChannel.stream_name_for(users(:one)), 1) do
      CableHeartbeatJob.perform_now(users(:one).id)
    end
  end

  test "the broadcast carries the time it was sent" do
    freeze_time do
      CableHeartbeatJob.perform_now(users(:one).id)

      message = broadcasts(HeartbeatChannel.stream_name_for(users(:one))).last
      assert_equal({ "at" => Time.current.iso8601 }, ActiveSupport::JSON.decode(message))
    end
  end

  test "broadcasts to no one else" do
    assert_no_broadcasts(HeartbeatChannel.stream_name_for(users(:two))) do
      CableHeartbeatJob.perform_now(users(:one).id)
    end
  end

  # A heartbeat aimed at a deleted account is a diagnostic typo, not an error
  # worth retrying: there is no stream anyone could be listening on.
  test "does nothing when the user is gone" do
    missing_id = User.maximum(:id).to_i + 1

    assert_no_broadcasts("heartbeat:#{missing_id}") do
      assert_nothing_raised { CableHeartbeatJob.perform_now(missing_id) }
    end
  end
end
