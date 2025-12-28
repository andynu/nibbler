module Api
  module V1
    class CategoriesController < BaseController
      before_action :set_category, only: [ :show, :update, :destroy, :reorder ]

      # GET /api/v1/categories
      def index
        @categories = current_user.categories.includes(:feeds).ordered

        render json: @categories.map { |cat| category_json(cat) }
      end

      # GET /api/v1/categories/:id
      def show
        render json: category_json(@category, include_feeds: true)
      end

      # POST /api/v1/categories
      def create
        @category = current_user.categories.build(category_params)

        if @category.save
          render json: category_json(@category), status: :created
        else
          render json: { errors: @category.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/categories/:id
      def update
        if @category.update(category_params)
          render json: category_json(@category)
        else
          render json: { errors: @category.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/categories/:id
      def destroy
        # Optionally move feeds to another category
        if params[:move_feeds_to].present?
          target = current_user.categories.find_by(id: params[:move_feeds_to])
          @category.feeds.update_all(category_id: target&.id)
        end

        @category.destroy
        head :no_content
      end

      # PATCH /api/v1/categories/:id/reorder
      def reorder
        new_order = params[:order_id].to_i
        new_parent_id = params[:parent_id]

        @category.update!(order_id: new_order, parent_id: new_parent_id)
        render json: category_json(@category)
      end

      # GET /api/v1/categories/tree
      def tree
        root_categories = current_user.categories.roots.includes(:children, :feeds).ordered
        render json: root_categories.map { |cat| category_tree_json(cat) }
      end

      private

      def set_category
        @category = current_user.categories.find(params[:id])
      end

      def category_params
        params.require(:category).permit(:title, :parent_id, :collapsed, :order_id, :view_settings)
      end

      def category_json(category, include_feeds: false)
        json = {
          id: category.id,
          title: category.title,
          parent_id: category.parent_id,
          collapsed: category.collapsed,
          order_id: category.order_id,
          feed_count: category.feeds.size,
          unread_count: category.feeds.sum { |f| f.user_entries.unread.count }
        }

        if include_feeds
          json[:feeds] = category.feeds.ordered.map do |feed|
            {
              id: feed.id,
              title: feed.title,
              feed_url: feed.feed_url,
              site_url: feed.site_url,
              icon_url: feed.icon_url,
              unread_count: feed.user_entries.unread.count,
              last_updated: feed.last_updated
            }
          end
        end

        json
      end

      def category_tree_json(category)
        {
          id: category.id,
          title: category.title,
          collapsed: category.collapsed,
          order_id: category.order_id,
          feed_count: category.feeds.size,
          unread_count: category.feeds.sum { |f| f.user_entries.unread.count },
          feeds: category.feeds.ordered.map do |feed|
            {
              id: feed.id,
              title: feed.title,
              icon_url: feed.icon_url,
              unread_count: feed.user_entries.unread.count
            }
          end,
          children: category.children.ordered.map { |child| category_tree_json(child) }
        }
      end
    end
  end
end
