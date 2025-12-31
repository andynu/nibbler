# Represents a matching condition within a filter.
#
# FilterRules define what articles a filter applies to using regex patterns.
# Each rule specifies a field to match (title, content, link, author, or tag)
# and a regular expression. Rules can be inverted via the `inverse` flag.
#
# Rules can optionally be scoped to specific feeds or categories, allowing
# targeted filtering. Multiple rules in a filter are combined (all must match
# for the filter to trigger).
#
# @see Filter for the parent automation rule
# @see FilterAction for what happens when rules match
class FilterRule < ApplicationRecord
  belongs_to :filter
  belongs_to :feed, optional: true
  belongs_to :category, optional: true

  FILTER_TYPES = %w[title content both link date author tag].freeze

  validates :reg_exp, presence: true
  validates :filter_type, presence: true, inclusion: { in: FILTER_TYPES }

  def matches?(article)
    regex = Regexp.new(reg_exp, Regexp::IGNORECASE)
    result = case filter_type
    when "title"
               regex.match?(article[:title].to_s)
    when "content"
               regex.match?(article[:content].to_s)
    when "both"
               regex.match?(article[:title].to_s) || regex.match?(article[:content].to_s)
    when "link"
               regex.match?(article[:link].to_s)
    when "author"
               regex.match?(article[:author].to_s)
    when "tag"
               article[:tags]&.any? { |t| regex.match?(t) }
    when "date"
               matches_date?(article)
    else
               false
    end
    inverse ? !result : result
  rescue RegexpError
    false
  end

  private

  # Matches article date against the date criterion in reg_exp.
  #
  # Supported formats:
  #   <7d           - published within last 7 days (relative)
  #   >7d           - published more than 7 days ago (relative)
  #   >2025-01-01   - published after date (absolute)
  #   <2025-01-01   - published before date (absolute)
  #   2025-01-01..2025-12-31 - published within date range (absolute)
  def matches_date?(article)
    article_date = article[:published] || article[:updated]
    return false unless article_date

    # Ensure we have a Time object
    article_date = Time.parse(article_date.to_s) unless article_date.is_a?(Time)

    criterion = reg_exp.to_s.strip

    case criterion
    when /^<(\d+)d$/  # Within last N days
      days = ::Regexp.last_match(1).to_i
      article_date >= days.days.ago
    when /^>(\d+)d$/  # More than N days ago
      days = ::Regexp.last_match(1).to_i
      article_date < days.days.ago
    when /^>(\d{4}-\d{2}-\d{2})$/  # After specific date
      date = Date.parse(::Regexp.last_match(1))
      article_date.to_date > date
    when /^<(\d{4}-\d{2}-\d{2})$/  # Before specific date
      date = Date.parse(::Regexp.last_match(1))
      article_date.to_date < date
    when /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/  # Date range
      start_date = Date.parse(::Regexp.last_match(1))
      end_date = Date.parse(::Regexp.last_match(2))
      article_date.to_date >= start_date && article_date.to_date <= end_date
    else
      false
    end
  rescue ArgumentError, TypeError
    false
  end
end
