# Job to generate TTS audio for an article's content
# Enqueued when a user requests audio for an article
class GenerateArticleAudioJob < ApplicationJob
  queue_as :default

  # Retry on transient failures but give up after a few attempts
  retry_on StandardError, wait: :polynomially_longer, attempts: 3

  def perform(entry_id)
    entry = Entry.find_by(id: entry_id)
    return unless entry

    result = TtsGenerator.new(entry).generate

    if result.success
      Rails.logger.info "Generated TTS audio for entry #{entry.id} (#{result.cached_audio.duration}s)"
    else
      Rails.logger.warn "TTS generation failed for entry #{entry.id}: #{result.error}"
    end
  end
end
