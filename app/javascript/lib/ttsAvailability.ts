// Reads whether the server can run text-to-speech, as the Rails layout stamps
// it into <head> from TtsGenerator.available?.
//
// Only an explicit "false" hides the TTS controls. A missing tag counts as
// available, so a page without it still offers them and falls back to the
// audio endpoint's "unavailable" status, which the player already reports.

export function ttsAvailable(): boolean {
  const content = document
    .querySelector('meta[name="tts-available"]')
    ?.getAttribute("content")
    ?.trim()

  return content !== "false"
}
