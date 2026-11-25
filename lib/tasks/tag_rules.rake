namespace :tag_rules do
  desc "Create a feed-scoped tag rule for every feed tag (safe to re-run)"
  task convert_feed_tags: :environment do
    result = FeedTagConverter.convert

    puts "feed tags : #{FeedTag.count}"
    puts "created   : #{result.created} rules (ApplyTagRuleJob queued for each)"
    puts "existing  : #{result.existing} rules already there"
    puts "skipped   : #{result.skipped.size}"
    result.skipped.each do |skip|
      feed_tag = skip.feed_tag
      puts "  feed #{feed_tag.feed_id} tag #{feed_tag.tag_id} (#{feed_tag.tag&.name.inspect}): #{skip.errors.join('; ')}"
    end
  end
end
