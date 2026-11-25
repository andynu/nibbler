# Publishes the week's morning-paper picks. Scheduled in
# config/initializers/good_job.rb; rake paper:select runs it by hand.
#
# @see PaperSelection
class PaperSelectionJob < ApplicationJob
  queue_as :default

  # @param window_days [Integer, String, nil] overrides PaperSelection::WINDOW
  # @return [Array<PaperSelection::Result>]
  def perform(window_days: nil)
    window = window_days.present? ? Integer(window_days).days : PaperSelection::WINDOW
    results = PaperSelection.run(window: window)

    results.each do |result|
      Rails.logger.info(
        "[PaperSelectionJob] user #{result.tag.user_id} tag #{result.tag.name.inspect}: " \
        "#{result.candidates} candidates, published #{result.published.map(&:id).inspect}"
      )
    end

    results
  end
end
