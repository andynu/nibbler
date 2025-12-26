module Api
  module V1
    class FiltersController < BaseController
      before_action :set_filter, only: [:show, :update, :destroy, :test]

      # GET /api/v1/filters
      def index
        @filters = current_user.filters.includes(:filter_rules, :filter_actions).ordered

        render json: @filters.map { |f| filter_json(f) }
      end

      # GET /api/v1/filters/:id
      def show
        render json: filter_json(@filter)
      end

      # POST /api/v1/filters
      def create
        @filter = current_user.filters.build(filter_params)

        if @filter.save
          render json: filter_json(@filter), status: :created
        else
          render json: { errors: @filter.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH/PUT /api/v1/filters/:id
      def update
        if @filter.update(filter_params)
          render json: filter_json(@filter)
        else
          render json: { errors: @filter.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/filters/:id
      def destroy
        @filter.destroy
        head :no_content
      end

      # POST /api/v1/filters/:id/test
      def test
        articles = test_articles
        matches = articles.select { |a| filter_matches?(a) }

        render json: {
          total_tested: articles.size,
          matches: matches.size,
          matched_articles: matches.map { |a| { id: a[:id], title: a[:title] } }
        }
      end

      private

      def set_filter
        @filter = current_user.filters.find(params[:id])
      end

      def filter_params
        params.require(:filter).permit(
          :title, :enabled, :match_any_rule, :inverse, :order_id,
          filter_rules_attributes: [
            :id, :_destroy, :filter_type, :reg_exp, :inverse,
            :feed_id, :category_id, :cat_filter, :match_on
          ],
          filter_actions_attributes: [
            :id, :_destroy, :action_type, :action_param
          ]
        )
      end

      def filter_json(filter)
        {
          id: filter.id,
          title: filter.title,
          enabled: filter.enabled,
          match_any_rule: filter.match_any_rule,
          inverse: filter.inverse,
          order_id: filter.order_id,
          last_triggered: filter.last_triggered,
          rules: filter.filter_rules.map { |r| rule_json(r) },
          actions: filter.filter_actions.map { |a| action_json(a) }
        }
      end

      def rule_json(rule)
        {
          id: rule.id,
          filter_type: rule.filter_type,
          filter_type_name: FilterRule::FILTER_TYPES.key(rule.filter_type),
          reg_exp: rule.reg_exp,
          inverse: rule.inverse,
          feed_id: rule.feed_id,
          category_id: rule.category_id,
          cat_filter: rule.cat_filter,
          match_on: rule.match_on
        }
      end

      def action_json(action)
        {
          id: action.id,
          action_type: action.action_type,
          action_type_name: FilterAction::ACTION_TYPES.key(action.action_type),
          action_param: action.action_param
        }
      end

      def test_articles
        # Get recent articles from the user's feeds for testing
        current_user.user_entries
          .joins(:entry)
          .includes(:entry)
          .order("entries.date_entered DESC")
          .limit(100)
          .map do |ue|
            {
              id: ue.entry.id,
              title: ue.entry.title,
              content: ue.entry.content,
              link: ue.entry.link,
              author: ue.entry.author,
              tags: ue.tag_cache.split(",")
            }
          end
      end

      def filter_matches?(article)
        return false if @filter.filter_rules.empty?

        if @filter.match_any_rule
          # Any rule matches
          result = @filter.filter_rules.any? { |rule| rule.matches?(article) }
        else
          # All rules must match
          result = @filter.filter_rules.all? { |rule| rule.matches?(article) }
        end

        @filter.inverse ? !result : result
      end
    end
  end
end
