# An LLM-written summary of an article, cached against the shared Entry.
#
# Summaries hang off Entry rather than UserEntry because a summary of an
# article's text does not vary by who is reading it. Entries are shared across
# subscribers (see Entry), so one reader asking for a summary produces one every
# other subscriber to that feed gets for free. On a local Ollama server with
# finite throughput that is the difference between generating a summary once and
# generating it once per subscriber.
#
# @see Entry#entry_summary
# @see CachedAudio for the same caching shape applied to TTS audio
class EntrySummary < ApplicationRecord
  belongs_to :entry

  validates :summary, presence: true
  validates :content_hash, presence: true
  validates :model, presence: true
  validates :generated_at, presence: true

  # True when this summary was written against the entry's current text.
  #
  # Compares the stored hash to Entry#content_hash, the hash the ingest path
  # already maintains for update detection (FeedUpdater writes
  # Digest::SHA256.hexdigest(content) on every fetch). CachedAudio#valid_for_content?
  # answers the same question but takes the content and hashes it itself, with
  # its own tags-stripped normalisation; there is no reason to compute a second
  # hash of the same text here when the entry already carries one.
  #
  # @return [Boolean]
  def valid_for_content?
    content_hash == entry.content_hash
  end

  # True when the article has changed since this summary was written.
  #
  # A stale summary is still shown to the reader, marked as describing an
  # earlier version of the article, with a control to regenerate it. It is
  # deliberately not hidden and deliberately not regenerated on read: most feed
  # edits are typo fixes or re-tagging rather than rewrites, so the old summary
  # is usually still broadly true and worth more to a triage decision than a
  # blank space. The accepted cost is that a content hash cannot tell a typo fix
  # from a rewrite, so an occasional stale summary really will describe text
  # that is gone.
  #
  # This is the opposite of the audio path, which destroys a stale CachedAudio
  # on read (Api::V1::EntriesController#audio) because half-matching audio is of
  # no use to anyone. Do not "fix" this to match it.
  #
  # Exposed as a boolean because a client cannot answer the question itself: it
  # never sees either content_hash, so the read path has to send this flag
  # alongside the summary text.
  #
  # @return [Boolean]
  def stale?
    !valid_for_content?
  end
end
