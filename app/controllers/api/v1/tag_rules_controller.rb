module Api
  module V1
    # Saved searches that tag articles automatically (TagRule). Every lookup
    # goes through the signed-in user, and TagRule itself refuses a tag, feed
    # or category that belongs to someone else.
    class TagRulesController < BaseController
      before_action :set_rule, only: [ :update, :destroy ]

      # GET /api/v1/tag_rules?tag_id=:tag_id
      def index
        tag = current_user.tags.find(params[:tag_id])
        rules = tag.tag_rules.includes(:feed, :category).order(:created_at, :id).to_a

        render json: rules.map { |rule| rule_json(rule, match_counts(rules)) }
      end

      # GET /api/v1/tag_rules/preview?query=...&feed_id=...&category_id=...
      # How many of the user's articles a rule with this query and scope
      # matches today, before it is saved.
      def preview
        rule = TagRule.new(user: current_user, query: params[:query].to_s,
                           feed_id: params[:feed_id].presence, category_id: params[:category_id].presence)
        rule.validate
        # No tag yet: the dialog asks for one alongside the count.
        errors = rule.errors.reject { |error| error.attribute == :tag }.map(&:full_message)
        return render json: { errors: errors }, status: :unprocessable_entity if errors.any?

        render json: { match_count: rule.matching_entries.count }
      end

      # POST /api/v1/tag_rules
      # Body: { tag_rule: { query, feed_id, category_id, tag_id } } or, for a
      # tag that does not exist yet, tag_name in place of tag_id.
      def create
        rule = TagRule.new(rule_params.merge(user: current_user))

        TagRule.transaction do
          rule.tag = tag_for_create if rule.tag_id.nil?
          raise ActiveRecord::Rollback unless rule.save
        end

        if rule.persisted?
          render json: rule_json(rule, match_counts([ rule ])), status: :created
        else
          render json: { errors: rule.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # PATCH /api/v1/tag_rules/:id
      def update
        if @rule.update(rule_params)
          render json: rule_json(@rule, match_counts([ @rule ]))
        else
          render json: { errors: @rule.errors.full_messages }, status: :unprocessable_entity
        end
      end

      # DELETE /api/v1/tag_rules/:id
      def destroy
        @rule.destroy!
        head :no_content
      end

      private

      def set_rule
        @rule = TagRule.where(user: current_user).find(params[:id])
      end

      def rule_params
        params.require(:tag_rule).permit(:query, :feed_id, :category_id, :tag_id)
      end

      # A new tag is created only alongside a rule that saves, so a refused
      # rule leaves no stray tag behind.
      def tag_for_create
        name = params.dig(:tag_rule, :tag_name).to_s.strip
        return nil if name.blank?

        current_user.tags.where("LOWER(name) = ?", name.downcase).first ||
          current_user.tags.create(name: name)
      end

      def match_counts(rules)
        @match_counts ||= EntryTagRuleMatch.where(tag_rule_id: rules.map(&:id)).group(:tag_rule_id).count
      end

      def rule_json(rule, counts)
        {
          id: rule.id,
          tag_id: rule.tag_id,
          tag_name: rule.tag.name,
          query: rule.query,
          feed_id: rule.feed_id,
          category_id: rule.category_id,
          scope_name: rule.feed&.title || rule.category&.title || "All feeds",
          match_count: counts.fetch(rule.id, 0)
        }
      end
    end
  end
end
