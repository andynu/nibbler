# Turns every FeedTag into the TagRule that replaces it: the tag's name as the
# query, scoped to that feed, owned by the tag's user.
#
# Safe to run again: a feed tag whose rule already exists is counted, not
# duplicated. Existing entry_tags rows are left as they are (manual), so the
# conversion never removes a tag. Each new rule queues ApplyTagRuleJob on
# commit, which records its matches over the feed's history.
#
# @see TagRule.watch_feed
class FeedTagConverter
  Skipped = Data.define(:feed_tag, :errors)
  Result = Data.define(:created, :existing, :skipped)

  # @return [Result]
  def self.convert
    created = 0
    existing = 0
    skipped = []

    FeedTag.includes(:feed, :tag).find_each do |feed_tag|
      rule = TagRule.watch_feed(tag: feed_tag.tag, feed: feed_tag.feed)

      if rule.previously_new_record?
        created += 1
      elsif rule.persisted?
        existing += 1
      else
        skipped << Skipped.new(feed_tag: feed_tag, errors: rule.errors.full_messages)
      end
    end

    Result.new(created: created, existing: existing, skipped: skipped)
  end
end
