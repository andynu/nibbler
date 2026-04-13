require "net/http"
require "uri"
require "json"

# Client for Ollama's /api/generate endpoint.
#
# Wraps HTTP calls to a local Ollama server (typically running on baru)
# and provides a simple interface for generating text or structured JSON.
#
# @example Basic usage
#   LlmClient.new.generate(prompt: "Hello")
#   # => "Hi there!"
#
# @example JSON response
#   LlmClient.new.generate(prompt: "...", format: :json)
#   # => { "key" => "value" }
#
# @example Custom model and timeout
#   LlmClient.new(model: "mistral-small3.2")
#     .generate(prompt: "...", timeout: 60)
class LlmClient
  # Raised when the Ollama server is unreachable (down, timeout, refused)
  class Unreachable < StandardError; end

  # Raised when format: :json is requested but the response doesn't parse
  class BadJson < StandardError; end

  DEFAULT_URL = "http://baru:11434".freeze
  DEFAULT_MODEL = "gemma4:e4b".freeze
  DEFAULT_TIMEOUT = 120
  SLOW_CALL_THRESHOLD = 30.0 # seconds

  attr_reader :url, :model

  def initialize(url: ENV.fetch("OLLAMA_URL", DEFAULT_URL), model: ENV.fetch("OLLAMA_MODEL", DEFAULT_MODEL))
    @url = url
    @model = model
  end

  # Generate text from the LLM.
  #
  # @param prompt [String] the prompt to send
  # @param format [Symbol, nil] :json to request and parse JSON, nil for plain text
  # @param timeout [Integer] read timeout in seconds
  # @return [Hash, String] parsed hash if format: :json, raw string otherwise
  # @raise [Unreachable] if the server is down or unreachable
  # @raise [BadJson] if format: :json and response doesn't parse
  def generate(prompt:, format: nil, timeout: DEFAULT_TIMEOUT)
    body = build_request_body(prompt: prompt, format: format)
    started_at = Process.clock_gettime(Process::CLOCK_MONOTONIC)

    response = post_json("/api/generate", body, timeout: timeout)

    elapsed = Process.clock_gettime(Process::CLOCK_MONOTONIC) - started_at
    log_slow_call(elapsed, prompt) if elapsed > SLOW_CALL_THRESHOLD

    parse_response(response, format: format)
  end

  private

  def build_request_body(prompt:, format:)
    body = {
      model: @model,
      prompt: prompt,
      stream: false
    }
    body[:format] = "json" if format == :json
    body
  end

  def post_json(path, body, timeout:)
    uri = URI.join(@url, path)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == "https")
    http.open_timeout = 10
    http.read_timeout = timeout

    request = Net::HTTP::Post.new(uri.request_uri)
    request["Content-Type"] = "application/json"
    request.body = JSON.generate(body)

    http.request(request)
  rescue Errno::ECONNREFUSED, Errno::EHOSTUNREACH, Errno::ENETUNREACH, SocketError => e
    raise Unreachable, "Ollama unreachable at #{@url}: #{e.class}: #{e.message}"
  rescue Net::OpenTimeout, Net::ReadTimeout => e
    raise Unreachable, "Ollama timed out at #{@url}: #{e.class}: #{e.message}"
  end

  def parse_response(response, format:)
    unless response.is_a?(Net::HTTPSuccess)
      raise Unreachable, "Ollama returned HTTP #{response.code}: #{response.body.to_s[0, 500]}"
    end

    outer = JSON.parse(response.body)
    raw = outer["response"].to_s

    return raw unless format == :json

    begin
      JSON.parse(raw)
    rescue JSON::ParserError => e
      raise BadJson, "Ollama response was not valid JSON: #{e.message} (body: #{raw[0, 500]})"
    end
  rescue JSON::ParserError => e
    # Failed to parse the outer envelope from Ollama itself
    raise Unreachable, "Ollama returned unparseable body: #{e.message}"
  end

  def log_slow_call(elapsed, prompt)
    Rails.logger.warn(
      "LlmClient slow call: #{elapsed.round(2)}s model=#{@model} " \
      "prompt_size=#{prompt.bytesize}B"
    )
  end
end
