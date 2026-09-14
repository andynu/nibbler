require "test_helper"

class CountersChannelTest < ActionCable::Channel::TestCase
  include ActionCable::TestHelper

  test "subscribes the connected user to their own stream" do
    stub_connection current_user: users(:one)

    subscribe

    assert subscription.confirmed?
    assert_has_stream "counters:#{users(:one).id}"
  end

  test "does not put two users on the same stream" do
    stub_connection current_user: users(:two)

    subscribe

    assert_has_stream "counters:#{users(:two).id}"
    assert_has_no_stream "counters:#{users(:one).id}"
  end

  # The stream comes from the connection, never from the client, so naming
  # another user in the subscription params changes nothing.
  test "ignores a user id sent by the client" do
    stub_connection current_user: users(:two)

    subscribe user_id: users(:one).id

    assert subscription.confirmed?
    assert_has_stream "counters:#{users(:two).id}"
    assert_has_no_stream "counters:#{users(:one).id}"
  end

  test "stream_name_for is what the broadcasting side uses" do
    assert_equal "counters:#{users(:one).id}", CountersChannel.stream_name_for(users(:one))
  end

  test "broadcast_stale sends a nudge carrying no counts" do
    CountersChannel.broadcast_stale(users(:one))

    message = broadcasts(CountersChannel.stream_name_for(users(:one))).last
    assert_equal({ "stale" => true }, ActiveSupport::JSON.decode(message))
  end
end
