namespace :filters do
  desc "Run backfill for a specific filter"
  task :backfill, [ :filter_id ] => :environment do |_t, args|
    filter = Filter.find(args[:filter_id])
    user = filter.user

    puts "Running backfill for filter: #{filter.title} (ID: #{filter.id})"
    puts "User: #{user.login}"

    affected_count = run_backfill_for_filter(filter, user)
    puts "Done! Affected #{affected_count} articles."
  end

  desc "Run backfill for all enabled filters for a user"
  task :backfill_all, [ :user_login ] => :environment do |_t, args|
    user_login = args[:user_login] || "admin"
    user = User.find_by!(login: user_login)

    filters = user.filters.enabled.ordered
    puts "Running backfill for #{filters.count} enabled filters for user: #{user_login}"

    filters.each do |filter|
      puts "\n  Processing: #{filter.title}..."
      affected_count = run_backfill_for_filter(filter, user)
      puts "    Affected #{affected_count} articles."
    end

    puts "\nDone!"
  end

  desc "Run backfill for all enabled filters for ALL users (one-time initialization)"
  task backfill_all_users: :environment do
    User.find_each do |user|
      filters = user.filters.enabled
      next if filters.empty?

      puts "Processing user: #{user.login} (#{filters.count} filters)"

      filters.ordered.each do |filter|
        print "  #{filter.title}... "
        affected_count = run_backfill_for_filter(filter, user)
        puts "#{affected_count} articles"
      end
    end

    puts "\nBackfill complete!"
  end

  private

  def run_backfill_for_filter(filter, user)
    affected_count = 0

    user_entries_scope(filter, user).find_each do |user_entry|
      article = build_article_for_backfill(user_entry)

      if filter_matches_with_scope?(filter, user_entry, article)
        apply_filter_actions(filter, user_entry, user)
        affected_count += 1
      end
    end

    filter.update_column(:last_triggered, Time.current) if affected_count > 0
    affected_count
  end

  def user_entries_scope(filter, user)
    scope = user.user_entries.joins(:entry).includes(:entry, :feed, :tags)

    feed_ids = filter.filter_rules.map(&:feed_id).compact.uniq
    category_ids = filter.filter_rules.map(&:category_id).compact.uniq

    scope = scope.where(feed_id: feed_ids) if feed_ids.any?

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
      tags: user_entry.tags.pluck(:tag_name),
      published: entry.updated,
      updated: entry.updated
    }
  end

  def filter_matches_with_scope?(filter, user_entry, article)
    return false if filter.filter_rules.empty?

    if filter.match_any_rule
      result = filter.filter_rules.any? { |rule| rule_matches_with_scope?(rule, user_entry, article) }
    else
      result = filter.filter_rules.all? { |rule| rule_matches_with_scope?(rule, user_entry, article) }
    end

    filter.inverse ? !result : result
  end

  def rule_matches_with_scope?(rule, user_entry, article)
    return false if rule.feed_id.present? && user_entry.feed_id != rule.feed_id
    return false if rule.category_id.present? && user_entry.feed&.category_id != rule.category_id

    rule.matches?(article)
  end

  def apply_filter_actions(filter, user_entry, user)
    entry = user_entry.entry

    filter.filter_actions.each do |action|
      case action.action_type
      when FilterAction::ACTION_TYPES[:mark_read]
        user_entry.update!(unread: false)

      when FilterAction::ACTION_TYPES[:delete]
        user_entry.destroy!
        return

      when FilterAction::ACTION_TYPES[:star]
        user_entry.update!(marked: true)

      when FilterAction::ACTION_TYPES[:publish]
        user_entry.update!(published: true)

      when FilterAction::ACTION_TYPES[:score]
        score_delta = action.action_param.to_i
        user_entry.update!(score: user_entry.score + score_delta)

      when FilterAction::ACTION_TYPES[:label]
        label = user.labels.find_by(id: action.action_param.to_i)
        if label && !entry.labels.include?(label)
          entry.labels << label
        end

      when FilterAction::ACTION_TYPES[:tag]
        tag_name = action.action_param.to_s.strip
        if tag_name.present? && !user_entry.tags.exists?(tag_name: tag_name)
          user_entry.tags.create!(tag_name: tag_name, user: user)
        end

      when FilterAction::ACTION_TYPES[:stop]
        # Stop action doesn't make sense in backfill context
        # Just ignore it

      when FilterAction::ACTION_TYPES[:ignore_tag]
        tag_name = action.action_param.to_s.strip
        user_entry.tags.where(tag_name: tag_name).destroy_all
      end
    end
  end
end
