# Executes user filters against a newly created user entry
class FilterExecutor
  def initialize(user_entry)
    @user_entry = user_entry
    @user = user_entry.user
    @entry = user_entry.entry
  end

  def execute
    article = build_article_hash

    @user.filters.enabled.ordered.each do |filter|
      if matches_filter?(filter, article)
        # Track when filter was triggered
        filter.update_column(:last_triggered, Time.current)

        # Execute filter actions
        should_stop = execute_actions(filter)

        # If 'stop' action was triggered, don't process more filters
        break if should_stop
      end
    end
  end

  def self.execute(user_entry)
    new(user_entry).execute
  end

  private

  def build_article_hash
    {
      id: @entry.id,
      title: @entry.title,
      content: @entry.content,
      link: @entry.link,
      author: @entry.author,
      tags: @entry.tags.where(user_id: @user.id).pluck(:name)
    }
  end

  def matches_filter?(filter, article)
    return false if filter.filter_rules.empty?

    if filter.match_any_rule
      # Any rule matches (OR)
      result = filter.filter_rules.any? { |rule| rule_matches?(rule, article) }
    else
      # All rules must match (AND)
      result = filter.filter_rules.all? { |rule| rule_matches?(rule, article) }
    end

    filter.inverse ? !result : result
  end

  def rule_matches?(rule, article)
    # Check feed/category scope
    if rule.feed_id.present?
      return false unless @user_entry.feed_id == rule.feed_id
    end

    if rule.category_id.present?
      return false unless @user_entry.feed&.category_id == rule.category_id
    end

    rule.matches?(article)
  end

  def execute_actions(filter)
    should_stop = false

    filter.filter_actions.each do |action|
      case action.action_type
      when FilterAction::ACTION_TYPES[:mark_read]
        @user_entry.update!(unread: false)
        Rails.logger.info "Filter #{filter.id}: marked entry #{@entry.id} as read"

      when FilterAction::ACTION_TYPES[:delete]
        @user_entry.destroy!
        Rails.logger.info "Filter #{filter.id}: deleted user_entry for entry #{@entry.id}"
        return true # Stop processing, entry is gone

      when FilterAction::ACTION_TYPES[:star]
        @user_entry.update!(marked: true)
        Rails.logger.info "Filter #{filter.id}: starred entry #{@entry.id}"

      when FilterAction::ACTION_TYPES[:publish]
        @user_entry.update!(published: true)
        Rails.logger.info "Filter #{filter.id}: published entry #{@entry.id}"

      when FilterAction::ACTION_TYPES[:score]
        score_delta = action.action_param.to_i
        @user_entry.update!(score: @user_entry.score + score_delta)
        Rails.logger.info "Filter #{filter.id}: changed score by #{score_delta} for entry #{@entry.id}"

      when FilterAction::ACTION_TYPES[:label]
        # Label action now uses Tag (labels have been consolidated into tags)
        add_tag_to_entry(action.action_param.to_i, filter)

      when FilterAction::ACTION_TYPES[:tag]
        tag_name = action.action_param.to_s.strip.downcase
        if tag_name.present?
          tag = @user.tags.find_or_create_by!(name: tag_name) do |t|
            t.bg_color = "#64748b"
            t.fg_color = "#ffffff"
          end
          unless @entry.tags.include?(tag)
            @entry.tags << tag
            Rails.logger.info "Filter #{filter.id}: added tag '#{tag_name}' to entry #{@entry.id}"
          end
        end

      when FilterAction::ACTION_TYPES[:stop]
        should_stop = true
        Rails.logger.info "Filter #{filter.id}: stop processing for entry #{@entry.id}"

      when FilterAction::ACTION_TYPES[:ignore_tag]
        # Remove tag if present
        tag_name = action.action_param.to_s.strip.downcase
        tag = @user.tags.find_by(name: tag_name)
        if tag
          EntryTag.where(entry: @entry, tag: tag).destroy_all
          Rails.logger.info "Filter #{filter.id}: removed tag '#{tag_name}' from entry #{@entry.id}"
        end
      end
    end

    should_stop
  end

  def add_tag_to_entry(tag_id, filter)
    tag = @user.tags.find_by(id: tag_id)
    if tag && !@entry.tags.include?(tag)
      @entry.tags << tag
      Rails.logger.info "Filter #{filter.id}: added tag '#{tag.name}' to entry #{@entry.id}"
    end
  end
end
