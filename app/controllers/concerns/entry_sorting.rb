# The "column:direction,column:direction" grammar that the entry list and
# search both read off the sort param: split on commas, trim, split each clause
# on the colon, match the column name case-insensitively, and take a direction
# the same way with descending as the answer to anything unrecognised. One
# control on the client writes that string for both endpoints, so the two
# cannot read it differently and there is nothing here for either to decide.
#
# The grammar only. Which columns an endpoint offers, what a recognised name
# resolves to, and where a request with nothing recognisable in it lands are
# each the caller's, and they have already drifted: /entries offers score and
# unread and falls back to import date, /search offers relevance instead, ranks
# by it, and refuses the two that a search result does not carry. Folding those
# together would mean one endpoint sorting by a column its own JSON has no
# field for, so they stay as they are.
module EntrySorting
  extend ActiveSupport::Concern

  VALID_DIRECTIONS = %w[asc desc].freeze

  # What a clause means when it names no direction, or names one the grammar
  # does not know. Newest, highest, last: the reader asking for a column
  # without saying which end usually wants the top of it.
  DEFAULT_DIRECTION = "desc".freeze

  private

  # Reads +sort_string+ into an ordered list of { column:, direction: } specs.
  #
  # The block receives each column name already downcased and returns whatever
  # the caller wants stored under :column -- a SQL fragment, or the name back
  # again -- or nil to drop the clause. That block is the caller's whole
  # vocabulary; everything around it is the grammar.
  #
  # An unrecognised column is dropped rather than refused, so a sort carried
  # over from the other endpoint degrades instead of erroring. A string with
  # nothing recognisable left in it, or no string at all, yields +default+.
  def parse_sort_clauses(sort_string, default:)
    return default if sort_string.blank?

    clauses = sort_string.split(",").filter_map do |clause|
      name, direction = clause.strip.split(":")
      column = yield(name.to_s.downcase)
      next unless column

      { column: column, direction: sort_direction(direction) }
    end

    clauses.presence || default
  end

  def sort_direction(direction)
    direction = direction.to_s.downcase
    VALID_DIRECTIONS.include?(direction) ? direction : DEFAULT_DIRECTION
  end
end
