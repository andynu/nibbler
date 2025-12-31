module Api
  module V1
    class FiltersController < BaseController
      before_action :set_filter, only: [ :show, :update, :destroy, :test, :backfill ]

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

      # POST /api/v1/filters/:id/backfill
      # Apply this filter to all existing articles matching its scope
      def backfill
        affected_count = 0

        user_entries_scope.find_each do |user_entry|
          article = build_article_for_backfill(user_entry)

          if filter_matches_with_scope?(user_entry, article)
            apply_filter_actions(user_entry)
            affected_count += 1
          end
        end

        # Update last_triggered if any articles matched
        @filter.update_column(:last_triggered, Time.current) if affected_count > 0

        render json: {
          affected_count: affected_count
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
          action_param: action.action_param
        }
      end

      def test_articles
        # Get recent articles from the user's feeds for testing
        current_user.user_entries
          .joins(:entry)
          .includes(entry: :tags)
          .order("entries.date_entered DESC")
          .limit(100)
          .map do |ue|
            {
              id: ue.entry.id,
              title: ue.entry.title,
              content: ue.entry.content,
              link: ue.entry.link,
              author: ue.entry.author,
              tags: ue.entry.tags.map(&:name)
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

      # Determine the scope of user_entries to backfill based on filter rules
      def user_entries_scope
        scope = current_user.user_entries.joins(:entry).includes(:entry, :feed, :tags)

        # Collect feed/category constraints from rules
        feed_ids = @filter.filter_rules.map(&:feed_id).compact.uniq
        category_ids = @filter.filter_rules.map(&:category_id).compact.uniq

        # If rules are scoped to specific feeds, limit to those
        scope = scope.where(feed_id: feed_ids) if feed_ids.any?

        # If rules are scoped to specific categories, limit to feeds in those categories
        if category_ids.any?
          scope = scope.joins(:feed).where(feeds: { category_id: category_ids })
        end

        scope
      end

      def build_article_for_backfill(user_entry)
        entry = user_entry.entry
        {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          link: entry.link,
          author: entry.author,
          tags: entry.tags.where(user_id: current_user.id).pluck(:name),
          published: entry.updated,
          updated: entry.updated
        }
      end

      def filter_matches_with_scope?(user_entry, article)
        return false if @filter.filter_rules.empty?

        if @filter.match_any_rule
          result = @filter.filter_rules.any? { |rule| rule_matches_with_scope?(rule, user_entry, article) }
        else
          result = @filter.filter_rules.all? { |rule| rule_matches_with_scope?(rule, user_entry, article) }
        end

        @filter.inverse ? !result : result
      end

      def rule_matches_with_scope?(rule, user_entry, article)
        # Check feed scope
        return false if rule.feed_id.present? && user_entry.feed_id != rule.feed_id

        # Check category scope
        return false if rule.category_id.present? && user_entry.feed&.category_id != rule.category_id

        rule.matches?(article)
      end

      def apply_filter_actions(user_entry)
        entry = user_entry.entry

        @filter.filter_actions.each do |action|
          case action.action_type
          when "mark_read"
            user_entry.update!(unread: false)

          when "delete"
            user_entry.destroy!
            return # Stop processing, entry is gone

          when "star"
            user_entry.update!(marked: true)

          when "publish"
            user_entry.update!(published: true)

          when "score"
            score_delta = action.action_param.to_i
            user_entry.update!(score: user_entry.score + score_delta)

          when "label"
            # Label action now uses Tag (labels have been consolidated into tags)
            tag = current_user.tags.find_by(id: action.action_param.to_i)
            if tag && !entry.tags.include?(tag)
              entry.tags << tag
            end

          when "tag"
            tag_name = action.action_param.to_s.strip.downcase
            if tag_name.present?
              tag = current_user.tags.find_or_create_by!(name: tag_name) do |t|
                t.bg_color = "#64748b"
                t.fg_color = "#ffffff"
              end
              entry.tags << tag unless entry.tags.include?(tag)
            end

          when "stop"
            # Stop action doesn't make sense in backfill context (no filter chain)
            # Just ignore it

          when "ignore_tag"
            tag_name = action.action_param.to_s.strip.downcase
            tag = current_user.tags.find_by(name: tag_name)
            EntryTag.where(entry: entry, tag: tag).destroy_all if tag
          end
        end
      end
    end
  end
end
