import type { Page } from "@playwright/test"

/**
 * A silent WAV as a data: URI, built here rather than committed as a binary.
 *
 * The audio panel only reaches its playable state once the audio element fires
 * `canplaythrough`. A data: URI gets it there without the network: nothing that
 * uses this reaches the TTS service or any host.
 *
 * Sixty seconds because a clip ending is not neutral - the queue advances,
 * finds nothing, and the panel goes away mid-example.
 */
function silentWavDataUri(seconds = 60, rate = 8000): string {
  const samples = Math.round(seconds * rate)
  const bytes = new Uint8Array(44 + samples)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }
  ascii(0, "RIFF")
  view.setUint32(4, 36 + samples, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true) // PCM header length
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate, true) // byte rate: 8-bit mono
  view.setUint16(32, 1, true) // block align
  view.setUint16(34, 8, true) // bits per sample
  ascii(36, "data")
  view.setUint32(40, samples, true)
  bytes.fill(128, 44) // 8-bit PCM is unsigned; silence is the midpoint

  // btoa rather than Buffer: tsconfig.json deliberately leaves @types/node
  // out, so Node's globals are not declared for anything under e2e/. Chunked
  // because String.fromCharCode takes its bytes as arguments and half a
  // megabyte of them overflows the call stack.
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:audio/wav;base64,${btoa(binary)}`
}

/**
 * Answers the TTS endpoint locally with a ready, silent clip, so no example
 * waits on a generation job. Call it before the page navigates.
 */
export async function stubTtsAudio(page: Page): Promise<void> {
  const audioUrl = silentWavDataUri()

  await page.route("**/api/v1/entries/*/audio", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ready",
        audio_url: audioUrl,
        duration: 60,
        timestamps: [],
      }),
    })
  )
}
