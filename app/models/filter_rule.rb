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

  METRIC_TYPES = %w[word_count link_density].freeze
  FILTER_TYPES = (%w[title content both link date author tag] + METRIC_TYPES).freeze

  NUMBER = /\d+(?:\.\d+)?/
  THRESHOLD = /\A\s*(?:(?<op>>=|<=|>|<)\s*(?<value>#{NUMBER})|(?<low>#{NUMBER})\s*\.\.\s*(?<high>#{NUMBER}))\s*\z/

  validates :reg_exp, presence: true
  validates :filter_type, presence: true, inclusion: { in: FILTER_TYPES }

  def matches?(article)
    return matches_metric?(article) if METRIC_TYPES.include?(filter_type)
    return matches_dated?(article) if filter_type == "date"

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
    else
               false
    end
    inverse ? !result : result
  rescue RegexpError
    false
  end

  private

  # An unmeasured entry or a malformed threshold matches nothing, inverse
  # included, so negation never auto-publishes an entry nobody has measured.
  def matches_metric?(article)
    value = article[filter_type.to_sym]
    return false if value.nil?

    result = matches_threshold?(value)
    return false if result.nil?

    inverse ? !result : result
  end

  # An undated entry or a malformed criterion matches nothing, inverse included.
  def matches_dated?(article)
    result = matches_date?(article)
    return false if result.nil?

    inverse ? !result : result
  end

  # Compares a metric against the threshold in reg_exp.
  #
  # Supported formats: >=N, >N, <=N, <N, N..M (inclusive), where N and M are
  # integers or decimals. Returns nil when the threshold is malformed.
  def matches_threshold?(value)
    match = THRESHOLD.match(reg_exp.to_s)
    return nil unless match

    value = value.to_f
    return value.between?(match[:low].to_f, match[:high].to_f) if match[:low]

    threshold = match[:value].to_f
    case match[:op]
    when ">=" then value >= threshold
    when ">" then value > threshold
    when "<=" then value <= threshold
    when "<" then value < threshold
    end
  end

  # Matches article date against the date criterion in reg_exp.
  #
  # Supported formats:
  #   <7d           - published within last 7 days (relative)
  #   >7d           - published more than 7 days ago (relative)
  #   >2025-01-01   - published after date (absolute)
  #   <2025-01-01   - published before date (absolute)
  #   2025-01-01..2025-12-31 - published within date range (absolute)
  #
  # Returns nil when the entry has no usable date or the criterion is malformed.
  def matches_date?(article)
    article_date = article[:published] || article[:updated]
    return nil unless article_date

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
    end
  rescue ArgumentError, TypeError
    nil
  end
end
