require "test_helper"

class LlmClientTest < ActiveSupport::TestCase
  def setup
    @url = "http://test-ollama:11434"
    @client = LlmClient.new(url: @url, model: "test-model")
  end

  # ===================
  # Defaults & Env Vars
  # ===================

  test "uses OLLAMA_URL env var when set" do
    ENV.stub :fetch, ->(key, default) { key == "OLLAMA_URL" ? "http://custom:9999" : default } do
      client = LlmClient.new
      assert_equal "http://custom:9999", client.url
    end
  end

  test "uses OLLAMA_MODEL env var when set" do
    ENV.stub :fetch, ->(key, default) { key == "OLLAMA_MODEL" ? "custom-model" : default } do
      client = LlmClient.new
      assert_equal "custom-model", client.model
    end
  end

  test "defaults URL and model when env vars absent" do
    ENV.stub :fetch, ->(_key, default) { default } do
      client = LlmClient.new
      assert_equal LlmClient::DEFAULT_URL, client.url
      assert_equal LlmClient::DEFAULT_MODEL, client.model
    end
  end

  # ===================
  # Plain Text Generation
  # ===================

  test "returns string response for plain text generation" do
    stub_request(:post, "#{@url}/api/generate")
      .with(body: hash_including(model: "test-model", prompt: "hello", stream: false))
      .to_return(
        status: 200,
        body: { response: "Hi there!" }.to_json,
        headers: { "Content-Type" => "application/json" }
      )

    result = @client.generate(prompt: "hello")
    assert_equal "Hi there!", result
  end

  test "sends stream: false in request body" do
    stub_request(:post, "#{@url}/api/generate")
      .with(body: hash_including(stream: false))
      .to_return(status: 200, body: { response: "ok" }.to_json)

    @client.generate(prompt: "hello")
  end

  # ===================
  # JSON Generation
  # ===================

  test "parses JSON response when format: :json" do
    stub_request(:post, "#{@url}/api/generate")
      .with(body: hash_including(format: "json"))
      .to_return(
        status: 200,
        body: { response: '{"verdict":"new","score":0.8}' }.to_json
      )

    result = @client.generate(prompt: "analyze", format: :json)
    assert_equal({ "verdict" => "new", "score" => 0.8 }, result)
  end

  test "raises BadJson when format: :json and response is not JSON" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 200, body: { response: "not json at all" }.to_json)

    assert_raises(LlmClient::BadJson) do
      @client.generate(prompt: "analyze", format: :json)
    end
  end

  test "does not request format: json when format is nil" do
    stub_request(:post, "#{@url}/api/generate")
      .with { |req|
        body = JSON.parse(req.body)
        !body.key?("format")
      }
      .to_return(status: 200, body: { response: "plain" }.to_json)

    @client.generate(prompt: "hello")
  end

  # ===================
  # Unreachable Errors
  # ===================

  test "raises Unreachable on connection refused" do
    stub_request(:post, "#{@url}/api/generate").to_raise(Errno::ECONNREFUSED)

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  test "raises Unreachable on host unreachable" do
    stub_request(:post, "#{@url}/api/generate").to_raise(Errno::EHOSTUNREACH)

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  test "raises Unreachable on socket error" do
    stub_request(:post, "#{@url}/api/generate").to_raise(SocketError.new("getaddrinfo"))

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  test "raises Unreachable on read timeout" do
    stub_request(:post, "#{@url}/api/generate").to_raise(Net::ReadTimeout)

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  test "raises Unreachable on HTTP 500" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 500, body: "server error")

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  test "raises Unreachable on HTTP 404" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 404, body: "not found")

    assert_raises(LlmClient::Unreachable) do
      @client.generate(prompt: "hello")
    end
  end

  # ===================
  # Slow Call Logging
  # ===================

  test "logs warning for slow calls over 30s" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 200, body: { response: "ok" }.to_json)

    # Simulate elapsed time > 30s by stubbing Process.clock_gettime
    times = [ 0.0, 35.0 ]
    Process.stub :clock_gettime, ->(_clock) { times.shift } do
      assert_logs_match(/LlmClient slow call: 35\.0s/) do
        @client.generate(prompt: "hello")
      end
    end
  end

  test "does not log for fast calls" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 200, body: { response: "ok" }.to_json)

    times = [ 0.0, 1.0 ]
    Process.stub :clock_gettime, ->(_clock) { times.shift } do
      refute_logs_match(/LlmClient slow call/) do
        @client.generate(prompt: "hello")
      end
    end
  end

  # ===================
  # Metrics Logging
  # ===================

  test "logs metrics when Ollama returns eval_count and eval_duration" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(
        status: 200,
        body: {
          response: "ok",
          eval_count: 150,
          eval_duration: 1_000_000_000 # 1 second in nanoseconds
        }.to_json
      )

    assert_logs_match(/LlmClient metrics: model=test-model .* eval_count=150 eval_duration=1\.0s tokens_per_sec=150\.0/) do
      @client.generate(prompt: "hello")
    end
  end

  test "does not log metrics when eval_count is missing" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(status: 200, body: { response: "ok" }.to_json)

    refute_logs_match(/LlmClient metrics:/) do
      @client.generate(prompt: "hello")
    end
  end

  test "does not log metrics when eval_duration is zero" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(
        status: 200,
        body: { response: "ok", eval_count: 10, eval_duration: 0 }.to_json
      )

    refute_logs_match(/LlmClient metrics:/) do
      @client.generate(prompt: "hello")
    end
  end

  test "metrics are logged even when format: :json response parsing occurs" do
    stub_request(:post, "#{@url}/api/generate")
      .to_return(
        status: 200,
        body: {
          response: '{"k":"v"}',
          eval_count: 50,
          eval_duration: 2_000_000_000 # 2s
        }.to_json
      )

    assert_logs_match(/eval_count=50 eval_duration=2\.0s tokens_per_sec=25\.0/) do
      @client.generate(prompt: "hello", format: :json)
    end
  end

  # ===================
  # Model Parameter
  # ===================

  test "sends configured model in request body" do
    stub_request(:post, "#{@url}/api/generate")
      .with(body: hash_including(model: "test-model"))
      .to_return(status: 200, body: { response: "ok" }.to_json)

    @client.generate(prompt: "hello")
  end

  test "can override model per-instance" do
    client = LlmClient.new(url: @url, model: "other-model")

    stub_request(:post, "#{@url}/api/generate")
      .with(body: hash_including(model: "other-model"))
      .to_return(status: 200, body: { response: "ok" }.to_json)

    client.generate(prompt: "hello")
  end

  private

  def assert_logs_match(pattern)
    logged = capture_logs { yield }
    assert_match pattern, logged
  end

  def refute_logs_match(pattern)
    logged = capture_logs { yield }
    refute_match pattern, logged
  end

  def capture_logs
    io = StringIO.new
    original_logger = Rails.logger
    Rails.logger = Logger.new(io)
    yield
    io.string
  ensure
    Rails.logger = original_logger
  end
end
