module Api
  module V1
    class CountersController < BaseController
      # GET /api/v1/counters
      def index
        feed_counts = current_user.user_entries
          .unread
          .group(:feed_id)
          .count

        category_counts = current_user.user_entries
          .unread
          .joins(:feed)
          .group("feeds.category_id")
          .count

        total_unread = current_user.user_entries.unread.count
        starred_count = current_user.user_entries.starred.count
        published_count = current_user.user_entries.published.count
        fresh_count = current_user.user_entries
          .unread
          .joins(:entry)
          .where("entries.date_entered > ?", 24.hours.ago)
          .count

        render json: {
          feeds: feed_counts,
          categories: category_counts,
          virtual: {
            all: total_unread,
            fresh: fresh_count,
            starred: starred_count,
            published: published_count
          },
          total: total_unread
        }
      end
    end
  end
end
