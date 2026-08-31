import { test, expect, type Page } from "./fixtures"

/**
 * The seek bar is the only child of the audio panel's row that can give way,
 * and on a phone there was nothing left for it to take (ttrb-6hxv).
 *
 * Measured in Chromium against the unfixed panel, playing a stubbed 60s clip:
 *
 *   320px viewport   slider 0px wide, 6px tall
 *   360px viewport   slider 30px
 *   375px viewport   slider 45px
 *   640px viewport   slider 0px, and the row 9px wider than the panel
 *
 * 320 leaves the reader no seek control and no progress indication at all -
 * the bar is not narrow, it is absent, with nothing in the styling to say a
 * control is missing. At 360 a 30px track spans a minute, so a pixel is two
 * seconds, and a 40-minute podcast puts 53 seconds in each one.
 *
 * The panel does not overflow at any phone width, before the fix or after, so
 * the page-level and panel-level width checks that caught ttrb-h12t see
 * nothing here: `documentElement.scrollWidth` and the panel's own
 * `scrollWidth` both read the viewport width throughout. This is flex
 * distribution starving one child, not content spilling out of a box, and it
 * has to be caught by reading that child's geometry.
 *
 * 640 is here because the four `sm:` controls arrive together and put the row
 * over budget the moment they do, which is the same collapse a breakpoint
 * later. The last control's right edge is what shows it: at 640 the unfixed
 * row ended 649px into a 640px panel while `scrollWidth` still said 640.
 *
 * Why a browser spec: vitest runs on happy-dom, which loads no stylesheet and
 * resolves no media query, so nothing here is observable there - every box is
 * zero by zero and `xs:`/`sm:` mean nothing.
 *
 * Note that `toBeVisible()` and a plain `click()` both prove nothing about
 * this. Playwright reported the 0px slider as hidden but would still have
 * clicked its centre, so the example below reads geometry and then seeks to a
 * measured offset rather than tapping the middle.
 */

const AUDIO_PANEL = "audio-panel"

/** Below this the track cannot be aimed at, and 6px of it cannot be hit at all. */
const USABLE_TRACK_WIDTH = 64

/**
 * ttrb-w0w6 has the score buttons at 24px against ~44px of guidance, so 24 is
 * a floor rather than a target. The bar was 6px before this: the visible track
 * was the whole hit box.
 */
const USABLE_TRACK_HEIGHT = 24

/**
 * A silent WAV as a data: URI, built here rather than committed as a fixture.
 *
 * The panel only reaches its playable state once the audio element fires
 * `canplaythrough`, and the geometry under test belongs to a panel with
 * transport controls in it. A data: URI keeps that off the network: nothing in
 * this spec reaches the TTS service or any host.
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

/** Answers the TTS endpoint locally, so no example here waits on a generation job. */
async function stubTtsAudio(page: Page): Promise<void> {
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

const entryRows = (page: Page) =>
  page.getByRole("listbox", { name: "Entries" }).getByRole("option")

const seekBar = (page: Page) => page.getByRole("slider", { name: "Playback progress" })

/**
 * Opens the first article and starts reading it aloud.
 *
 * Waits on the slider's presence rather than its visibility: a zero-width box
 * is what this file exists to catch, and `toBeVisible()` calls one hidden.
 */
async function startReadingAloud(page: Page): Promise<void> {
  await expect(entryRows(page).first()).toBeVisible()
  await entryRows(page).first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()

  await page.getByRole("button", { name: "Listen" }).click()
  await expect(page.getByTestId(AUDIO_PANEL)).toBeVisible()
  await expect(seekBar(page)).toHaveCount(1)
}

/** The panel's box, and how far past its content box the row's last control reaches. */
async function rowOverhang(page: Page): Promise<number> {
  return page.evaluate((testId) => {
    const panel = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement
    const panelBox = panel.getBoundingClientRect()
    const padding = parseFloat(getComputedStyle(panel).paddingRight)
    const rightmost = Array.from(panel.children)
      .filter((child) => getComputedStyle(child as HTMLElement).display !== "none")
      .reduce((furthest, child) => Math.max(furthest, child.getBoundingClientRect().right), 0)

    return rightmost - (panelBox.right - padding)
  }, AUDIO_PANEL)
}

async function seekBarBox(page: Page) {
  const box = await seekBar(page).boundingBox()
  if (!box) throw new Error("expected the seek bar to be laid out")
  return box
}

const PHONE_WIDTHS = [320, 360, 375] as const

for (const width of PHONE_WIDTHS) {
  test.describe(`The audio panel's seek bar at ${width}px`, () => {
    test.use({ viewport: { width, height: 720 } })

    test.beforeEach(async ({ page }) => {
      await stubTtsAudio(page)
      await page.goto("/")
      await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
      await startReadingAloud(page)
    })

    test("the bar is wide enough to aim at and tall enough to hit", async ({ page }) => {
      const bar = await seekBarBox(page)

      expect(bar.width, `seek bar ${bar.width}px wide inside a ${width}px viewport`)
        .toBeGreaterThanOrEqual(USABLE_TRACK_WIDTH)
      expect(bar.height, `seek bar ${bar.height}px tall`).toBeGreaterThanOrEqual(
        USABLE_TRACK_HEIGHT
      )
    })

    // A guard rather than a catcher: the row fitted at these widths before the
    // fix too, by squeezing the bar out of existence rather than by spilling.
    // It is here so that shedding controls to make room is never traded for
    // the failure ttrb-h12t fixed in the article header.
    test("the row still fits inside the panel", async ({ page }) => {
      expect(await rowOverhang(page), "pixels past the panel's content box").toBeLessThanOrEqual(
        0.5
      )
    })
  })
}

test.describe("Seeking on a 320px phone", () => {
  test.use({ viewport: { width: 320, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await startReadingAloud(page)
  })

  test("a tap three quarters along the bar moves the clip there", async ({ page }) => {
    // Pause first: the readout is what proves the seek landed, and a running
    // clip moves it under the assertion.
    await page.getByRole("button", { name: "Pause" }).click()
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible()

    const bar = await seekBarBox(page)
    // page.mouse rather than locator.click(): Playwright aims at an element's
    // centre whether or not it has any size, so a click would have "worked" on
    // the 0px bar and told us nothing. Against the unfixed panel this lands on
    // the bar's left edge, the handler divides by a zero width, and assigning
    // the resulting NaN to currentTime throws instead of seeking.
    await page.mouse.click(bar.x + bar.width * 0.75, bar.y + bar.height / 2)

    await expect(page.getByTestId("audio-panel")).toContainText(/0:4[2-8] \/ 1:00/)
  })
})

test.describe("The audio panel where the sm controls arrive", () => {
  // 640 is the first pixel at which the speed control, the auto-scroll toggle
  // and the jump-to-source button are all on the row.
  test.use({ viewport: { width: 640, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await startReadingAloud(page)
  })

  test("the bar keeps its width and the row keeps inside the panel", async ({ page }) => {
    const bar = await seekBarBox(page)

    expect(bar.width, "seek bar width at the sm breakpoint").toBeGreaterThanOrEqual(
      USABLE_TRACK_WIDTH
    )
    expect(await rowOverhang(page), "pixels past the panel's content box").toBeLessThanOrEqual(
      0.5
    )
  })
})
