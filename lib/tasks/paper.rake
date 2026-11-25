namespace :paper do
  desc "Publish the morning-paper picks now (WINDOW_DAYS=n overrides the window)"
  task select: :environment do
    results = PaperSelectionJob.perform_now(window_days: ENV["WINDOW_DAYS"])

    puts "no tags are marked for the paper" if results.empty?
    results.each do |result|
      puts "user #{result.tag.user_id} tag #{result.tag.name}: #{result.candidates} candidates, " \
           "#{result.published.size} published"
      result.published.each { |row| puts "  #{row.entry.title}" }
    end
  end
end
