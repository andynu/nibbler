# Represents an individual article or post from an RSS/Atom feed.
#
# Entries are the core content units in the feed reader. They are shared across
# users (via UserEntry join records) to avoid duplicating article content when
# multiple users subscribe to the same feed.
#
# Each entry has a globally unique GUID from the source feed and a content_hash
# for detecting updates. PostgreSQL full-text search is supported via
# tsvector_combined, a GENERATED ALWAYS ... STORED column that PostgreSQL
# computes from title and content (see the migration for the expression and for
# why it is not a Rails callback). Nothing in Ruby writes it, and no write path
# can skip it.
#
# @see UserEntry for per-user read state and interaction
# @see Enclosure for attached media (audio, video, images)
# @see Tag for user-applied classification
class Entry < ApplicationRecord
  has_many :user_entries, dependent: :destroy
  has_many :users, through: :user_entries
  has_many :enclosures, dependent: :destroy
  has_many :entry_tags, dependent: :destroy
  has_many :tags, through: :entry_tags
  has_many :cached_images, dependent: :destroy
  has_one :cached_audio, dependent: :destroy

  validates :guid, presence: true, uniqueness: true
  validates :title, presence: true
  validates :link, presence: true
  validates :content_hash, presence: true

  # A body is optional. Headline-only and link-only items are a normal RSS
  # shape, not a malformed one: 20 of the 50 items in the Braintree, MA news
  # flash feed carry a title and a link and nothing else. Requiring presence
  # here rejected those items at ingest, which is the wrong half of the pair to
  # call invalid.
  #
  # nil is still rejected: the column is NOT NULL, so "" is the only acceptable
  # way to have no body.
  validates :content, exclusion: { in: [ nil ], message: "can't be nil" }

  scope :recent, -> { order(date_entered: :desc) }

  # The delimiters ts_headline wraps a matched lexeme in: U+0002 START OF TEXT
  # and U+0003 END OF TEXT. Control characters rather than markup, because the
  # marked excerpt travels to the browser as a JSON string that React renders as
  # a text node -- the client splits on these to build <mark> elements, so no
  # part of a snippet ever reaches dangerouslySetInnerHTML. XML 1.0 admits no C0
  # control character other than tab, LF and CR, so a well-formed feed cannot
  # deliver either of these in article text and collide with them.
  HEADLINE_START = 2.chr.freeze
  HEADLINE_STOP = 3.chr.freeze

  # The text the search index is built from: the body with tags flattened to
  # spaces and cut at 100k characters. It repeats the expression of the
  # tsvector_combined generated column (see
  # db/migrate/20260830003752_make_entry_tsvector_combined_generated.rb) because
  # an excerpt has to be cut from the same document the tsvector was built from.
  # Point ts_headline at the raw column instead and it hunts for the match in
  # markup the index never saw, then returns the tags as visible text.
  SEARCH_DOCUMENT_SQL = "regexp_replace(left(coalesce(entries.content, ''), 100000), '<[^>]*>', ' ', 'g')".freeze

  # Full-text search using PostgreSQL tsvector, most relevant first.
  scope :search, ->(query) {
    return none if query.blank?

    where(Arel.sql(text_search_condition(query)))
      .order(Arel.sql("#{text_search_rank(query)} DESC"))
  }

  # The three parts of a search, exposed so a query that reaches entries from
  # the other side of the join (UserEntry, say) can apply the same predicate,
  # the same ranking and the same excerpt. Without these, the only way to
  # combine a user's rows with full-text search is to run Entry.search, pluck
  # its ids, and re-query — which materialises every match in the shared entries
  # table and throws the ranking away.
  #
  # All three interpolate a quoted literal rather than a bind parameter because
  # a rank expression has to appear in ORDER BY, where Rails will not bind for
  # us. connection.quote handles the escaping.
  def self.text_search_condition(query)
    "entries.tsvector_combined @@ #{tsquery_sql(query)}"
  end

  def self.text_search_rank(query)
    "ts_rank(entries.tsvector_combined, #{tsquery_sql(query)})"
  end

  # An excerpt of the body cut around the lexemes the query actually matched,
  # with each of them delimited. A substring scan cannot do this job: the query
  # is stemmed on its way into the tsquery, so "studies" matches a body that
  # says "study", and then a /studies/i pass over that body finds nothing to
  # excerpt around and leaves the reader a hit with no visible reason for it.
  #
  # MaxWords/MinWords are the window ts_headline trims to; 35 words is roughly
  # the 200 characters the hand-rolled excerpt used. With no match in the body
  # at all -- a hit on the title alone -- ts_headline falls back to the opening
  # of the document, which is what the old code did too.
  def self.text_search_headline(query)
    options = "StartSel=#{HEADLINE_START}, StopSel=#{HEADLINE_STOP}, MaxWords=35, MinWords=15"
    "ts_headline('english', #{SEARCH_DOCUMENT_SQL}, #{tsquery_sql(query)}, #{connection.quote(options)})"
  end

  # The query is a phrase to be tokenised, not a LIKE pattern. This used to run
  # through sanitize_sql_like first, which named a protection that was not the
  # one in force here: measured against plainto_tsquery, foo_bar, 50%, C_plus
  # and back\slash all produce an identical tsquery with and without the
  # escaping, because the text search parser already treats _, % and \ as
  # separators. What actually keeps this safe is connection.quote.
  def self.tsquery_sql(query)
    "plainto_tsquery('english', #{connection.quote(query.to_s)})"
  end
  private_class_method :tsquery_sql
end
