# The scoping vocabulary the entry list and search both read: unread, starred,
# published, feed_id, category_id, tag, and the four virtual views with the
# Fresh window's age limit and per-feed cap.
#
# A search is meant to answer the query within the list the user is already
# looking at, so the two endpoints cannot read these params differently. A
# search scoped to Fresh that ranged over all history, or one whose category
# filter stopped at the named category while the sidebar's included its
# children, would be answering a different question than the list beside it.
# The two sites therefore change for the same reason by construction, which is
# what makes this worth one definition rather than two copies.
#
# Callers keep their own ordering, eager loads and pagination; this only adds
# WHERE clauses.
module EntryScoping
  extend ActiveSupport::Concern

  include FreshArticleWindow

  private

  # Applies every scoping param present on the request, in the order the entry
  # list has always applied them. The virtual view goes last for the reason
  # given on #apply_virtual_view.
  def apply_entry_scoping(scope)
    scope = filter_by_read_state(scope)
    scope = filter_by_starred(scope)
    scope = filter_by_published(scope)
    scope = filter_by_feed(scope)
    scope = filter_by_category(scope)
    scope = filter_by_tag(scope)
    apply_virtual_view(scope)
  end

  def filter_by_read_state(scope)
    return scope if params[:unread].blank?

    params[:unread] == "true" ? scope.unread : scope.read
  end

  def filter_by_starred(scope)
    params[:starred] == "true" ? scope.starred : scope
  end

  def filter_by_published(scope)
    params[:published] == "true" ? scope.published : scope
  end

  def filter_by_feed(scope)
    return scope if params[:feed_id].blank?

    scope.where(feed_id: params[:feed_id])
  end

  # A category stands for its whole subtree, matching the sidebar: selecting a
  # parent shows the feeds filed under its children too. An id that is not this
  # user's category filters nothing, rather than leaking another user's feeds.
  def filter_by_category(scope)
    return scope if params[:category_id].blank?

    category = current_user.categories.find_by(id: params[:category_id])
    return scope unless category

    scope.joins(:feed).where(feeds: { category_id: category.self_and_descendant_ids })
  end

  # Tags hang off Entry, so this reaches them through the entry join. Scoped to
  # the current user's tags: two users may both own a tag called "rails".
  def filter_by_tag(scope)
    return scope if params[:tag].blank?

    scope.joins(entry: :tags)
      .where(tags: { user_id: current_user.id, name: params[:tag].downcase.strip })
  end

  # Deliberately the last filter applied: the Fresh per-feed cap has to rank the
  # rows the request actually asked for, so the toolbar's "5 per feed" means the
  # newest 5 MATCHING articles of each feed. Capping before the tag filter
  # instead would rank all fresh rows and let the tag filter thin the survivors,
  # so a feed whose tagged articles rank 6th or later by import date would
  # return none. The same holds for a search term.
  def apply_virtual_view(scope)
    case params[:view]
    when "fresh"
      scope = scope.fresh(fresh_article_cutoff_for_param(params[:fresh_max_age]))
      per_feed = fresh_per_feed_limit(params[:fresh_per_feed])
      per_feed ? limit_per_feed(scope, per_feed) : scope
    when "starred"
      scope.starred
    when "published"
      scope.published
    when "archived"
      scope.read
    else
      scope
    end
  end

  # Limit results to N per feed by filtering the relation down to the ranked
  # ids, never by rebuilding it: the caller's ordering, eager loads and
  # filters all have to survive the cap. The ranking lives on UserEntry so
  # the counters endpoint can size the same cap without materialising rows.
  def limit_per_feed(user_entries, limit)
    user_entries.where(id: UserEntry.top_per_feed_ids(user_entries, limit))
  end
end
