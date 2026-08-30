require "test_helper"

class HeartbeatChannelTest < ActionCable::Channel::TestCase
  test "subscribes the connected user to their own stream" do
    stub_connection current_user: users(:one)

    subscribe

    assert subscription.confirmed?
    assert_has_stream "heartbeat:#{users(:one).id}"
  end

  test "does not put two users on the same stream" do
    stub_connection current_user: users(:two)

    subscribe

    assert_has_no_stream "heartbeat:#{users(:one).id}"
  end

  test "stream_name_for is what the broadcasting side uses" do
    assert_equal "heartbeat:#{users(:one).id}", HeartbeatChannel.stream_name_for(users(:one))
  end
end
