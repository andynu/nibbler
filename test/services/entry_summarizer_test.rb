require "test_helper"

class EntrySummarizerTest < ActiveSupport::TestCase
  # A sentence long enough to build realistic article bodies out of, and
  # punctuated so the sentence-boundary tests have boundaries to find.
  SENTENCE = "The commission said the brokers misreported client holdings across nine quarters. ".freeze

  # A plausible model response: prose, one paragraph, comfortably inside the
  # length bound and above the floor for "the model actually answered".
  PARAGRAPH = "Three brokerages will pay ninety million dollars to settle claims that " \
              "they misreported client holdings between 2023 and 2025, the largest such " \
              "settlement the commission has reached. None admitted wrongdoing.".freeze

  setup do
    @entry = entries(:basic)
    @entry.update!(
      title: "Regulator settles with three brokers",
      content: "<p>#{body_of(2_000)}</p>"
    )
  end

  # A body of at least `length` characters of prose.
  def body_of(length)
    SENTENCE * ((length / SENTENCE.length) + 1)
  end

  def summarizer(fake)
    EntrySummarizer.new(llm_client: fake)
  end

  # --- the result -----------------------------------------------------------

  test "returns the model's paragraph" do
    fake = FakeLlmClient.new(response: PARAGRAPH)

    assert_equal PARAGRAPH, summarizer(fake).summarize(@entry)[:summary]
  end

  test "reports the model that wrote the summary, read from the client rather than assumed" do
    fake = FakeLlmClient.new(response: PARAGRAPH, model: "some-other-model:9b")

    assert_equal "some-other-model:9b", summarizer(fake).summarize(@entry)[:model]
  end

  test "asks for prose, not JSON" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_nil fake.last_format, "a triage paragraph is prose; StoryAnalyzer's JSON shape is not the template"
  end

  test "sends its own timeout rather than inheriting the client default" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_equal EntrySummarizer::DEFAULT_TIMEOUT, fake.last_timeout
    assert_not_equal LlmClient::DEFAULT_TIMEOUT, fake.last_timeout
  end

  # --- the prompt -----------------------------------------------------------

  test "prompt carries the title and the article text" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_includes fake.last_prompt, "Regulator settles with three brokers"
    assert_includes fake.last_prompt, "misreported client holdings"
  end

  test "prompt asks for one paragraph and bounds its length" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_match(/one paragraph/i, fake.last_prompt)
    assert_match(/60 to 80 words/i, fake.last_prompt)
  end

  test "prompt forbids restating the title, which is what makes it triage rather than an abstract" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_match(/already read the title/i, fake.last_prompt)
  end

  test "markup never reaches the prompt" do
    @entry.update!(
      content: %(<div class="body"><p>#{body_of(2_000)}</p><a href="https://tracker.example/x">more</a></div>)
    )
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_not_includes fake.last_prompt, "<p>"
    assert_not_includes fake.last_prompt, "href"
    assert_not_includes fake.last_prompt, "tracker.example"
  end

  # strip_tags re-encodes special characters on the way out, so its raw output
  # still says "&amp;" and "&nbsp;". Those are noise to the model and padding to
  # the length measurement.
  test "HTML entities are decoded before the model sees them" do
    @entry.update!(content: "<p>AT&amp;T&nbsp;and Verizon. #{body_of(2_000)}</p>")
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_includes fake.last_prompt, "AT&T and Verizon"
    assert_not_includes fake.last_prompt, "&amp;"
    assert_not_includes fake.last_prompt, "&nbsp;"
  end

  test "article text is truncated at MAX_CONTENT_CHARS before it reaches the prompt" do
    over = body_of(EntrySummarizer::MAX_CONTENT_CHARS + 4_000)
    @entry.update!(content: "<p>#{over}TAIL_MARKER</p>")

    fake = FakeLlmClient.new(response: PARAGRAPH)
    summarizer(fake).summarize(@entry)

    assert_not_includes fake.last_prompt, "TAIL_MARKER"
    assert_operator fake.last_prompt.length, :<, over.length
  end

  # --- the thin-content refusal ---------------------------------------------

  test "refuses an excerpt-only article without calling the model" do
    @entry.update!(content: "<p>Two sentences is all this feed publishes. Read on at the source.</p>")
    fake = FakeLlmClient.new(response: PARAGRAPH)

    assert_raises(EntrySummarizer::TooShort) { summarizer(fake).summarize(@entry) }
    assert_nil fake.last_prompt, "nothing should be sent to the model for an article below the floor"
  end

  test "TooShort carries the measured length so the caller can explain itself" do
    @entry.update!(content: "<p>Two sentences is all this feed publishes. Read on at the source.</p>")
    expected = EntrySummarizer.article_text(@entry).length

    error = assert_raises(EntrySummarizer::TooShort) do
      summarizer(FakeLlmClient.new(response: PARAGRAPH)).summarize(@entry)
    end

    assert_equal expected, error.content_length
    assert_operator expected, :<, EntrySummarizer::MIN_CONTENT_CHARS
  end

  # The measurement-point test. An implementation that checks entry.content
  # rather than the stripped text passes this article to the model.
  test "the floor is measured on the stripped text, not the raw content column" do
    markup = %(<div class="wrapper"><span class="byline"></span></div>) * 60
    @entry.update!(content: "#{markup}<p>A single short sentence of actual article.</p>")

    assert_operator @entry.content.length, :>, EntrySummarizer::MIN_CONTENT_CHARS,
      "precondition: the raw column is over the floor on markup alone"

    fake = FakeLlmClient.new(response: PARAGRAPH)
    assert_raises(EntrySummarizer::TooShort) { summarizer(fake).summarize(@entry) }
    assert_nil fake.last_prompt
  end

  test "an article just over the floor is summarized" do
    text_only = body_of(EntrySummarizer::MIN_CONTENT_CHARS + 200)
    @entry.update!(content: "<p>#{text_only}</p>")

    assert EntrySummarizer.summarizable?(@entry)
    assert_equal PARAGRAPH, summarizer(FakeLlmClient.new(response: PARAGRAPH)).summarize(@entry)[:summary]
  end

  # Andy's rule: "TooShort and SummaryFailed must not be the same thing - one
  # means do not offer the feature, the other means the model misbehaved and a
  # retry is reasonable." A shared base class would let one rescue catch both,
  # which is the mistake this guards.
  test "TooShort and SummaryFailed are independently rescuable" do
    assert_not EntrySummarizer::TooShort <= EntrySummarizer::SummaryFailed
    assert_not EntrySummarizer::SummaryFailed <= EntrySummarizer::TooShort
    assert_equal StandardError, EntrySummarizer::TooShort.superclass
    assert_equal StandardError, EntrySummarizer::SummaryFailed.superclass
  end

  # --- unusable model output ------------------------------------------------

  test "raises SummaryFailed when the model returns an empty string" do
    assert_raises(EntrySummarizer::SummaryFailed) do
      summarizer(FakeLlmClient.new(response: "")).summarize(@entry)
    end
  end

  test "raises SummaryFailed when the model returns only whitespace" do
    assert_raises(EntrySummarizer::SummaryFailed) do
      summarizer(FakeLlmClient.new(response: "  \n \t  ")).summarize(@entry)
    end
  end

  test "raises SummaryFailed when the model returns a token instead of a paragraph" do
    assert_raises(EntrySummarizer::SummaryFailed) do
      summarizer(FakeLlmClient.new(response: "N/A")).summarize(@entry)
    end
  end

  test "raises SummaryFailed when the model returns nil" do
    assert_raises(EntrySummarizer::SummaryFailed) do
      summarizer(FakeLlmClient.new(response: nil)).summarize(@entry)
    end
  end

  # --- the model ignoring the prompt ---------------------------------------

  test "collapses a multi-paragraph response into one paragraph" do
    fake = FakeLlmClient.new(response: "Here is your one-paragraph summary:\n\n#{PARAGRAPH}")
    summary = summarizer(fake).summarize(@entry)[:summary]

    assert_not_includes summary, "\n"
    assert_includes summary, "Three brokerages will pay ninety million dollars",
      "joining paragraphs must keep the summary; taking the first would store the preamble instead"
  end

  test "a summary inside the bound is returned unchanged" do
    fake = FakeLlmClient.new(response: PARAGRAPH)
    summary = summarizer(fake).summarize(@entry)[:summary]

    assert_equal PARAGRAPH, summary
    assert_not_includes summary, "..."
  end

  test "an overlong response is cut back to MAX_SUMMARY_CHARS at a sentence boundary" do
    fake = FakeLlmClient.new(response: SENTENCE * 20)
    summary = summarizer(fake).summarize(@entry)[:summary]

    assert_operator summary.length, :<=, EntrySummarizer::MAX_SUMMARY_CHARS
    assert summary.end_with?("."), "expected a whole sentence, got: #{summary[-40..].inspect}"
    assert_not_includes summary, "...", "a clean sentence cut needs no ellipsis"
  end

  # The guard on the sentence-boundary rule: one short sentence followed by a
  # wall of unpunctuated text must not be cut back to that opening sentence.
  test "an overlong response with no usable sentence boundary falls back to a word boundary" do
    fake = FakeLlmClient.new(response: "Short. #{'holdings ' * 300}")
    summary = summarizer(fake).summarize(@entry)[:summary]

    assert_operator summary.length, :<=, EntrySummarizer::MAX_SUMMARY_CHARS
    assert summary.end_with?("..."), "a mid-sentence cut should say so"
    assert_operator summary.length, :>, EntrySummarizer::MAX_SUMMARY_CHARS / 2,
      "cutting back to the lone opening sentence would throw the summary away"
  end

  # --- propagation ----------------------------------------------------------

  test "lets Unreachable propagate for the job to retry" do
    fake = FakeLlmClient.new(raise: LlmClient::Unreachable.new("ollama down"))

    assert_raises(LlmClient::Unreachable) { summarizer(fake).summarize(@entry) }
  end

  # --- the read-path predicate ----------------------------------------------

  test "summarizable? answers without a client, so the read path can hide the affordance" do
    assert EntrySummarizer.summarizable?(@entry)

    @entry.update!(content: "<p>An excerpt.</p>")
    assert_not EntrySummarizer.summarizable?(@entry)
  end

  test "article_text handles an entry with no body at all" do
    @entry.update!(content: "")

    assert_equal "", EntrySummarizer.article_text(@entry)
    assert_not EntrySummarizer.summarizable?(@entry)
  end

  # strip_tags removes a tag and puts nothing in its place, so adjacent blocks
  # fuse: "<p>holdings.</p><p>The" comes back as "holdings.The". Over a long
  # article that invents a token at every paragraph, list item and cell
  # boundary, and the model reads words the article does not contain.
  test "adjacent blocks do not weld their words together" do
    @entry.update!(content: "<ul><li>Ninety million dollars</li><li>Nine quarters</li></ul><p>The filing says so.</p>")

    assert_equal "Ninety million dollars Nine quarters The filing says so.",
      EntrySummarizer.article_text(@entry)
  end

  # The guarantee the tag pattern rests on: ContentSanitizer escapes ">" inside
  # attribute values at ingest, so no stored tag carries the character that
  # would end the match early and spill the rest of the tag into the text.
  test "an angle bracket inside an attribute does not spill markup into the text" do
    @entry.update!(
      content: ContentSanitizer.sanitize(%(<p>Before</p><a title="x > y" href="https://e.example">link</a><p>After</p>))
    )

    assert_equal "Before link After", EntrySummarizer.article_text(@entry)
  end

  test "article_text collapses whitespace so block markup does not become blank lines" do
    @entry.update!(content: "<p>First line.</p>\n\n<p>Second   line.</p>")

    assert_equal "First line. Second line.", EntrySummarizer.article_text(@entry)
  end

  private

  class FakeLlmClient
    attr_reader :model, :last_prompt, :last_format, :last_timeout

    def initialize(response: nil, raise: nil, model: "gemma4:e4b")
      @response = response
      @raise = raise
      @model = model
    end

    def generate(prompt:, format: nil, timeout: nil)
      @last_prompt = prompt
      @last_format = format
      @last_timeout = timeout
      Kernel.raise(@raise) if @raise

      @response
    end
  end
end
