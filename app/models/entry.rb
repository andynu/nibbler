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
    return none if query.blank? || excludes_only?(query)

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

  # True when the query says only what to leave out: "-oil", or "-oil -gas".
  #
  # Such a query is a valid tsquery -- !'oil' -- and it matches every article
  # that does not mention oil, which is nearly the whole shared entries table.
  # The GIN index cannot answer a pure negation, so PostgreSQL falls back to a
  # sequential scan to produce a result set nobody asked for. The caller is
  # expected to say so rather than run it.
  #
  # Asked of PostgreSQL rather than parsed here, because the question is what
  # the real parser made of the string. A tsquery matches the empty document
  # exactly when every branch it can be satisfied by is a negation, which is the
  # definition wanted: "climate -oil" needs a lexeme and fails, "climate or
  # -oil" can be satisfied by the negated branch alone and passes. An all
  # stopword query ("a -the") parses to the empty tsquery, which matches nothing
  # at all and so is not this case.
  def self.excludes_only?(query)
    return false if query.blank?

    connection.select_value("SELECT ''::tsvector @@ #{tsquery_sql(query)}")
  end

  # The query is a search box's worth of text handed to websearch_to_tsquery,
  # the one PostgreSQL parser meant for input a person typed. Bare words are
  # ANDed, exactly as plainto_tsquery did before it, and three operators are
  # honoured on top of that: a leading "-" negates, "quoted words" become a
  # phrase, and a bare "or" alternates.
  #
  # It is also the parser that cannot fail. to_tsquery raises on malformed
  # input, which a search box guarantees a supply of; websearch_to_tsquery
  # returns the empty tsquery instead. Verified against the running server for
  # an unmatched double quote, a lone "-", a bare "or", the tsquery operators
  # themselves and an empty string: no error, no match.
  #
  # This is not a LIKE pattern, so there is no sanitize_sql_like call. That was
  # dropped as a no-op against plainto_tsquery and it stays a no-op here:
  # foo_bar, 50%, C_plus and back\slash each produce an identical tsquery with
  # and without the escaping, because _, % and \ are separators to the text
  # search parser under either function. What keeps this safe is connection.quote.
  def self.tsquery_sql(query)
    "websearch_to_tsquery('english', #{connection.quote(query.to_s)})"
  end
  private_class_method :tsquery_sql
end
