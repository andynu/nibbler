module Api
  module V1
    class CountersController < BaseController
      include FreshArticleWindow

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
        fresh_count = fresh_count_for_request

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

      private

      # The Fresh badge counts exactly the rows the Fresh list would render, so
      # it honours both the age window and the per-feed cap the list applies.
      def fresh_count_for_request
        scope = current_user.user_entries
          .fresh(fresh_article_cutoff_for_param(params[:fresh_max_age]))

        per_feed = fresh_per_feed_limit(params[:fresh_per_feed])
        return scope.count unless per_feed

        UserEntry.count_per_feed_capped(scope, per_feed)
      end
    end
  end
end
