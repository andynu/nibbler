require "cgi"

# Builds and executes the Ollama call that turns one article into a
# one-paragraph triage summary.
#
# The purpose is narrow and it shapes everything below: the reader wants to
# read one paragraph and decide whether the article is worth the rest of their
# time. That is not the same job as an abstract. An abstract restates the
# headline in longer words and tells a reader who has already read the headline
# nothing, which is exactly what an unconstrained "summarize this" prompt
# produces. The prompt here asks instead for what the piece reports or claims
# and what in it is actually new -- the numbers, names and findings a headline
# cannot carry -- so that continuing or moving on is a decision the paragraph
# can support.
#
# Modelled on StoryWrapupGenerator: prose out, returned close to verbatim, no
# format: :json. StoryAnalyzer asks for JSON and is not the template.
#
# @example
#   result = EntrySummarizer.new.summarize(entry)
#   result[:summary]  # => "The FTC's complaint names three brokers..."
#   result[:model]    # => "gemma4:e4b"
#
# @example Deciding whether to offer the feature at all
#   EntrySummarizer.summarizable?(entry)  # => false for an excerpt-only feed
#
# @see LlmClient for the underlying HTTP client
# @see EntrySummary for the row this result is persisted into
class EntrySummarizer
  # Raised when the model returned something unusable: empty, whitespace, or
  # too short to be the paragraph that was asked for.
  #
  # Deliberately unrelated to TooShort. This one means the model misbehaved and
  # a retry is reasonable; TooShort means the article can never be summarized
  # usefully and the feature should not be offered for it. A caller that
  # rescues one must not accidentally catch the other, so neither inherits from
  # the other and there is no shared base class to rescue by mistake.
  class SummaryFailed < StandardError; end

  # Raised when the article's text is below MIN_CONTENT_CHARS.
  #
  # A refusal, not a failure. Nothing was sent to the model and nothing will
  # succeed on retry; the article itself is the problem. Carries the measured
  # length so the caller can say what happened rather than showing a bare error.
  class TooShort < StandardError
    # @return [Integer] length of the stripped article text, in characters
    attr_reader :content_length

    def initialize(content_length)
      @content_length = content_length
      super("Article text is #{content_length} characters, below the #{MIN_CONTENT_CHARS} needed to summarize")
    end
  end

  # Floor on article length, measured on the HTML-stripped text rather than the
  # raw content column, so markup is not counted as article.
  #
  # Many feeds publish only an excerpt, so Entry#content is often a couple of
  # sentences. Summarizing those produces a summary no shorter than its input.
  # 1500 characters is roughly 250 words, which is about where a 60-80 word
  # triage paragraph still compresses the article threefold and is doing real
  # work. Below it the model reformats the lede and spends throughput on a
  # shared local Ollama server that other summaries are queued behind.
  #
  # Fetching the full article text for excerpt-only feeds is a separate
  # capability. Until it exists, this makes the feature unavailable on those
  # feeds rather than useless on them.
  MIN_CONTENT_CHARS = 1500

  # Ceiling on the article text sent to the model, for the same reason
  # StoryAnalyzer caps snippets and article counts: prompt size drives both
  # latency and context pressure, and neither should scale with whatever the
  # longest article in the feed happens to be.
  #
  # 12,000 characters is roughly 2,000 words, or about 3,000 tokens once the
  # instructions are added. Cutting from the front rather than sampling is
  # deliberate: news and blog writing is front-loaded, so the claim and what is
  # new about it are in the opening, which is the part a triage summary needs.
  MAX_CONTENT_CHARS = 12_000

  # Hard ceiling on the stored summary, applied after the fact because the
  # prompt's word budget is a request and a local model will overshoot it.
  # 900 characters is well above the 60-80 words asked for (roughly 520
  # characters), so a summary that merely runs long survives intact and only a
  # model that ignored the instruction outright gets cut.
  MAX_SUMMARY_CHARS = 900

  # Floor on the stored summary. Below this the model did not write a
  # paragraph -- it returned a token, a refusal, or a fragment -- and there is
  # nothing worth persisting.
  MIN_SUMMARY_CHARS = 40

  # Chosen rather than inherited. LlmClient defaults to 120s and StoryWrapupGenerator
  # raises that to 180s, but a wrapup narrates a whole story arc across up to 40
  # articles; this is one article in and roughly eighty words out, where the
  # generation itself is seconds. The budget is almost entirely queueing behind
  # other requests on the shared local server. 60s leaves room for that while
  # still being above LlmClient::SLOW_CALL_THRESHOLD, so a slow-but-working call
  # logs its warning and finishes, and short enough that a wedged one fails
  # while the reader is still on the page. Retry belongs to the job, not here.
  DEFAULT_TIMEOUT = 60

  # ActionView::Helpers::SanitizeHelper#strip_tags re-encodes special characters
  # on the way out, so its output still carries &amp;, &lt; and &nbsp; as
  # literal text. Left alone those reach the model as noise and, worse, inflate
  # the character count the MIN_CONTENT_CHARS floor is measured against -- a
  # non-breaking space costs six characters instead of one, which is enough
  # padding to push a genuinely thin article over the floor.
  NBSP_ENTITY = /&nbsp;/i

  # Tags are replaced with a space before they are stripped, because
  # strip_tags on its own removes them and leaves nothing in their place:
  # "<p>holdings.</p><p>The filing" comes back as "holdings.The filing", and a
  # long article welds a word pair at every paragraph, list item and table cell
  # boundary. The model then reads tokens that are not in the article.
  #
  # This is the same substitution Entry::SEARCH_DOCUMENT_SQL and the
  # tsvector_combined generated column make, for the same reason, and it rests
  # on the same guarantee: ContentSanitizer runs every stored body through
  # Loofah at ingest (FeedParser), which escapes any ">" inside an attribute
  # value to &gt;, so no tag here contains the character that would end the
  # match early. strip_tags still runs afterwards, so anything this pattern
  # leaves behind is handled by the real sanitizer rather than by a regex.
  TAG_PATTERN = /<[^>]*>/

  def initialize(llm_client: LlmClient.new)
    @llm_client = llm_client
  end

  # The article's text as the model will see it: tags removed, entities
  # decoded, whitespace collapsed.
  #
  # A class method because the read path needs to ask about length without
  # building a client or intending to generate anything.
  #
  # @param entry [Entry]
  # @return [String]
  def self.article_text(entry)
    html = entry.content.to_s
    return "" if html.blank?

    stripped = ActionController::Base.helpers.strip_tags(html.gsub(TAG_PATTERN, " "))
    CGI.unescapeHTML(stripped.gsub(NBSP_ENTITY, " ")).squish
  end

  # Whether this entry has enough text to be worth summarizing.
  #
  # Exposed so the UI can decline to offer the affordance at all on
  # excerpt-only feeds, and say why, rather than rendering a button that raises
  # TooShort when pressed.
  #
  # @param entry [Entry]
  # @return [Boolean]
  def self.summarizable?(entry)
    article_text(entry).length >= MIN_CONTENT_CHARS
  end

  # Summarize one article.
  #
  # @param entry [Entry]
  # @return [Hash] `{ summary: String, model: String }` -- the model is carried
  #   out so the persisted row can record which one wrote the text
  # @raise [TooShort] if the article is below MIN_CONTENT_CHARS; nothing was sent
  # @raise [SummaryFailed] if the model returned empty or unusable output
  # @raise [LlmClient::Unreachable] if Ollama is down (propagated for the job to retry)
  def summarize(entry)
    text = self.class.article_text(entry)
    raise TooShort, text.length if text.length < MIN_CONTENT_CHARS

    response = @llm_client.generate(
      prompt: build_prompt(entry, text),
      timeout: DEFAULT_TIMEOUT
    )

    { summary: normalize(response, entry), model: @llm_client.model }
  end

  private

  # Collapses the response to a single paragraph and enforces the length bound
  # the prompt only asked for.
  #
  # Joining every paragraph rather than keeping the first is deliberate. A model
  # that ignores "one paragraph" splits in one of two ways: summary followed by
  # elaboration, or a preamble line followed by the summary. Keeping the first
  # paragraph is right for the former and catastrophic for the latter -- it
  # stores "Here is a one-paragraph summary:" and throws the summary away.
  # Joining is merely wordy in the first case and correct in the second, and the
  # length cap does the actual bounding either way.
  def normalize(response, entry)
    text = response.to_s.squish

    if text.length < MIN_SUMMARY_CHARS
      raise SummaryFailed,
        "LLM returned an unusable summary for entry #{entry.id}: #{text.inspect}"
    end

    bound_length(text)
  end

  def bound_length(text)
    return text if text.length <= MAX_SUMMARY_CHARS

    window = text[0, MAX_SUMMARY_CHARS]
    sentence_end = window.rindex(/[.!?](?=\s|\z)/)

    # Only honour a sentence boundary that keeps most of the paragraph.
    # Otherwise a model that wrote one short sentence and then a wall of text
    # with no terminator would be cut back to that opening sentence.
    return window[0..sentence_end] if sentence_end && sentence_end >= MAX_SUMMARY_CHARS / 2

    # Cut the full text, not the window: the window is already exactly
    # MAX_SUMMARY_CHARS long, so truncate would find nothing to do and return it
    # whole, ellipsis and word boundary both skipped.
    text.truncate(MAX_SUMMARY_CHARS, separator: " ", omission: "...")
  end

  def build_prompt(entry, text)
    <<~PROMPT
      A reader is deciding whether to spend time on the article below. Write the
      one paragraph that lets them decide.

      Cover, in this order and in plain prose:
      - What the article reports or claims.
      - What in it is specific and new: the figures, names, dates, decisions or
        findings that the headline cannot carry.
      - What it leaves unresolved, if that is what a reader would want to know.

      Rules:
      - One paragraph, 60 to 80 words. No headings, no bullets, no markdown, no JSON.
      - The reader has already read the title. Do not restate it in longer words.
      - Do not open with "This article", "The piece" or "The author". Write about
        the subject, not about the writing.
      - Report what the article says. Do not judge it, rate it, or advise whether
        to read it.
      - If the article is thin, say what little it establishes rather than padding.
      - Output only the paragraph. No preamble, no sign-off, no notes about this prompt.

      Article title: #{entry.title}

      Article text:
      #{text.truncate(MAX_CONTENT_CHARS, omission: '...')}
    PROMPT
  end
end
