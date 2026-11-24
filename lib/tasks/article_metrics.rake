namespace :article_metrics do
  desc "Measure word_count and link_density for entries that have never been measured"
  task backfill: :environment do
    Entry.where(word_count: nil).includes(:entry_full_text).find_each { ArticleMetrics.refresh!(_1) }
  end
end
