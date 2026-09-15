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
# can skip it. Search also reads entry_full_texts.tsvector_content, generated
# the same way over a fetched article; see TEXT_SEARCH_JOIN_SQL.
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
  # On the entry rather than on UserEntry: a summary of the text is the same
  # summary whoever is reading, so one subscriber's request serves all of them.
  has_one :entry_summary, dependent: :destroy
  # The publisher's own copy of the article, fetched on demand when the feed
  # published only an excerpt. Shared for the same reason, and for one more: it
  # costs the publisher a request, and one per subscriber would be rude.
  has_one :entry_full_text, dependent: :destroy

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

  # The best article text available: the publisher's own copy when one has been
  # fetched and is still current, otherwise whatever the feed sent.
  #
  # This is the seam every text consumer opts into. A feature reading #content
  # directly gets the excerpt on excerpt-only feeds and behaves as it did before
  # this table existed; one reading this gets the whole article where there is
  # one and the excerpt where there is not, with no branch of its own and no
  # error to handle when the fetch failed. Degrading to the excerpt is the whole
  # contract.
  #
  # Deliberately not #cached_content: that is #content with its <img> URLs
  # rewritten to locally cached copies, which is a rendering concern and not part
  # of what the article says.
  #
  # @return [String]
  def readable_content
    full_text = entry_full_text
    return full_text.content if full_text&.usable?

    content
  end

  # The delimiters ts_headline wraps a matched lexeme in: U+0002 START OF TEXT
  # and U+0003 END OF TEXT. Control characters rather than markup, because the
  # marked excerpt travels to the browser as a JSON string that React renders as
  # a text node -- the client splits on these to build <mark> elements, so no
  # part of a snippet ever reaches dangerouslySetInnerHTML. XML 1.0 admits no C0
  # control character other than tab, LF and CR, so a well-formed feed cannot
  # deliver either of these in article text and collide with them.
  HEADLINE_START = 2.chr.freeze
  HEADLINE_STOP = 3.chr.freeze

  # EntryFullText#usable? in SQL, for a fetched row and its entry under the
  # given aliases: "ok", and fetched against the entry's current content_hash.
  # Search reads a fetched copy only when this holds. Entry#readable_content
  # shows the excerpt once the copy is stale, so matching on a stale copy would
  # open the reader onto an article without the words they searched for.
  USABLE_FULL_TEXT_SQL =
    "%<full_text>s.status = '#{EntryFullText::OK}' AND %<full_text>s.content_hash = %<entry>s.content_hash".freeze

  # The fetched article the rank and the excerpt read beside the entry. LEFT, so
  # an entry with no usable fetch still ranks on its title and excerpt alone.
  # Aliased so a caller's own join to entry_full_texts cannot collide with it.
  TEXT_SEARCH_JOIN_SQL =
    "LEFT JOIN entry_full_texts readable_full_texts ON readable_full_texts.entry_id = entries.id " \
    "AND #{format(USABLE_FULL_TEXT_SQL, full_text: 'readable_full_texts', entry: 'entries')}".freeze

  # What a matched entry is ranked against: its own vector plus the fetched
  # article's when the join found one.
  SEARCH_VECTOR_SQL = "(entries.tsvector_combined || coalesce(readable_full_texts.tsvector_content, ''::tsvector))".freeze

  # The ids a query matches, in two disjoint halves. An entry with no usable
  # fetched copy matches on its own vector, which entries_tsvector_combined_idx
  # serves. An entry with one matches on both vectors concatenated, and those
  # are the minority fetched on demand. One vector rather than two predicates
  # ORed, so the words of "quokka wombat" can be found one in each text and
  # "quokka -wombat" excludes a match on either.
  #
  # Not SEARCH_VECTOR_SQL @@ query over the joined row: no index can serve that
  # expression, so PostgreSQL detoasts and tests every entry's vector.
  TEXT_SEARCH_MATCHES_SQL = <<~SQL.squish.freeze
    SELECT indexed.id FROM entries indexed
    WHERE indexed.tsvector_combined @@ %<tsquery>s
      AND NOT EXISTS (
        SELECT 1 FROM entry_full_texts fetched
        WHERE fetched.entry_id = indexed.id
          AND #{format(USABLE_FULL_TEXT_SQL, full_text: 'fetched', entry: 'indexed')}
      )
    UNION ALL
    SELECT fetched.entry_id FROM entry_full_texts fetched
    JOIN entries indexed ON indexed.id = fetched.entry_id
      AND #{format(USABLE_FULL_TEXT_SQL, full_text: 'fetched', entry: 'indexed')}
    WHERE (indexed.tsvector_combined || fetched.tsvector_content) @@ %<tsquery>s
  SQL

  # The text an excerpt is cut from: each body with tags flattened to spaces and
  # cut at 100k characters. It repeats the generated columns' expression (see
  # db/migrate/20260830003752_make_entry_tsvector_combined_generated.rb) because
  # an excerpt has to be cut from the same document the tsvector was built from.
  # Point ts_headline at the raw column instead and it hunts for the match in
  # markup the index never saw, then returns the tags as visible text.
  #
  # The fetched article comes first because it is what the reading pane shows.
  # Without a usable fetch that half is NULL, and concat_ws skips it.
  SEARCH_DOCUMENT_SQL = <<~SQL.squish.freeze
    concat_ws(' ',
      regexp_replace(left(readable_full_texts.content, 100000), '<[^>]*>', ' ', 'g'),
      regexp_replace(left(coalesce(entries.content, ''), 100000), '<[^>]*>', ' ', 'g'))
  SQL

  # Full-text search using PostgreSQL tsvector, most relevant first.
  scope :search, ->(query) {
    return none if query.blank? || excludes_only?(query)

    joins(text_search_join)
      .where(Arel.sql(text_search_condition(query)))
      .order(Arel.sql("#{text_search_rank(query)} DESC"))
  }

  # The parts of a search, exposed so a query that reaches entries from the
  # other side of the join (UserEntry, say) can apply the same predicate, the
  # same ranking and the same excerpt. Without these, the only way to combine a
  # user's rows with full-text search is to run Entry.search, pluck its ids, and
  # re-query — which materialises every match in the shared entries table and
  # throws the ranking away.
  #
  # The rank and the excerpt read the fetched article, so a relation using
  # either has to add text_search_join first. Leave it out and PostgreSQL
  # raises on the missing readable_full_texts table, rather than quietly
  # ranking the excerpt alone. The predicate carries its own subqueries.
  #
  # The three that take a query interpolate a quoted literal rather than a bind
  # parameter because a rank expression has to appear in ORDER BY, where Rails
  # will not bind for us. connection.quote handles the escaping.
  def self.text_search_join
    TEXT_SEARCH_JOIN_SQL
  end

  def self.text_search_condition(query)
    "entries.id IN (#{format(TEXT_SEARCH_MATCHES_SQL, tsquery: tsquery_sql(query))})"
  end

  def self.text_search_rank(query)
    "ts_rank(#{SEARCH_VECTOR_SQL}, #{tsquery_sql(query)})"
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
