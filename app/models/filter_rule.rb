class FilterRule < ApplicationRecord
  belongs_to :filter
  belongs_to :feed, optional: true
  belongs_to :category, optional: true

  FILTER_TYPES = {
    title: 1,
    content: 2,
    both: 3,
    link: 4,
    date: 5,
    author: 6,
    tag: 7
  }.freeze

  validates :reg_exp, presence: true
  validates :filter_type, presence: true, inclusion: { in: FILTER_TYPES.values }

  def matches?(article)
    regex = Regexp.new(reg_exp, Regexp::IGNORECASE)
    result = case filter_type
             when FILTER_TYPES[:title]
               regex.match?(article[:title].to_s)
             when FILTER_TYPES[:content]
               regex.match?(article[:content].to_s)
             when FILTER_TYPES[:both]
               regex.match?(article[:title].to_s) || regex.match?(article[:content].to_s)
             when FILTER_TYPES[:link]
               regex.match?(article[:link].to_s)
             when FILTER_TYPES[:author]
               regex.match?(article[:author].to_s)
             when FILTER_TYPES[:tag]
               article[:tags]&.any? { |t| regex.match?(t) }
             else
               false
             end
    inverse ? !result : result
  rescue RegexpError
    false
  end
end
