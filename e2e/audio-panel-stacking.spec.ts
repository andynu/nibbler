import { test, expect, type Page } from "./fixtures"

/**
 * Two bars want the bottom of a phone screen, and only one of them can have it
 * (ttrb-8k7e).
 *
 * Measured at 375x720 in both engines before the fix: MobileNavBar occupied
 * 663..720 and AudioPanel 664..720, both `fixed bottom-0` at z-50 with the
 * panel rendered second, so the panel painted over every pixel of the nav bar
 * except its 1px top border. `elementFromPoint` at the centre of each of the
 * three tabs answered with a part of the audio panel rather than with the tab -
 * the panel's own container over Feeds, its progress bar over Articles - and
 * Playwright's click on the Feeds tab timed out on the interception in Chromium
 * and Firefox alike. A reader who started an article playing could not get back
 * to the list.
 *
 * getMainHeight() deducted both bars regardless, so the main row measured 607
 * of 720 while the two bars drew one 57px band, leaving a 56px strip of empty
 * background between the row and the nav bar.
 *
 * The fix stacks them: the panel's bottom edge is the nav bar's top edge, both
 * bars are visible, and the row is deducted by exactly what the two of them
 * draw. The pane switcher stays reachable while audio plays, which replacing
 * the nav bar with the panel would not have given.
 *
 * Why a browser spec: vitest runs on happy-dom, which loads no stylesheet and
 * resolves no calc(), so every box is zero by zero and occlusion cannot be
 * observed there at all.
 *
 * Note that toBeVisible() proves nothing here - it passed for the nav bar
 * throughout, with the panel drawn over it - so the load-bearing example below
 * taps a tab and checks that the pane actually changed.
 */

const NAV_BAR = "mobile-nav-bar"
const AUDIO_PANEL = "audio-panel"
const MAIN_ROW = "app-main-row"

const navBar = (page: Page) => page.getByTestId(NAV_BAR)
const audioPanel = (page: Page) => page.getByTestId(AUDIO_PANEL)

const entryRows = (page: Page) =>
  page.getByRole("listbox", { name: "Entries" }).getByRole("option")

/**
 * A silent WAV as a data: URI, built here rather than committed as a fixture.
 *
 * The panel only reaches its playable state once the audio element fires
 * `canplaythrough`, and the geometry under test is the geometry of a panel with
 * transport controls in it. A data: URI keeps that off the network: nothing in
 * this spec reaches the TTS service or any host.
 *
 * Sixty seconds because the clip ending is not neutral - the queue advances,
 * finds nothing, and the panel goes away mid-example. A two-second clip made an
 * earlier run of this file report the nav bar as tappable, having measured the
 * occlusion at 1.5s and clicked at 2.5s with the panel already gone.
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

  // btoa rather than Buffer: tsconfig.json deliberately leaves @types/node out,
  // so Node's globals are not declared for anything under e2e/. Chunked because
  // String.fromCharCode takes its bytes as arguments and half a megabyte of
  // them overflows the call stack.
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

/**
 * Opens the first article and starts reading it aloud.
 *
 * Waits on the progress slider rather than on the panel's box: the slider is
 * only rendered once the player is in a playable state, so it is the signal
 * that the bar has its transport controls and its final height.
 */
async function startReadingAloud(page: Page): Promise<void> {
  await expect(entryRows(page).first()).toBeVisible()
  await entryRows(page).first().click()
  await expect(page.getByTestId("entry-header")).toBeVisible()

  await page.getByRole("button", { name: "Listen" }).click()
  await expect(audioPanel(page)).toBeVisible()
  await expect(page.getByRole("slider", { name: "Playback progress" })).toBeVisible()
}

async function boxOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`expected ${testId} to be laid out`)
  return box
}

/**
 * Retries `measure` until the boxes agree, or gives up and reports the last
 * disagreement.
 *
 * The main row animates its height over 200ms whenever the panel appears, and
 * the panel is on screen from the moment the request starts rather than from
 * the moment it is playable. A single measurement therefore catches the row
 * somewhere on the curve: an early run of this file read 766.9 against a
 * settled 744 and called a correct desktop layout broken.
 */
async function eventually(measure: () => Promise<void>): Promise<void> {
  await expect(measure).toPass({ timeout: 5000, intervals: [50, 100, 250] })
}

test.describe("The audio panel against the phone's nav bar", () => {
  test.use({ viewport: { width: 375, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(navBar(page)).toBeVisible()
  })

  // The premise. If the nav bar stops owning the bottom edge, the rest of this
  // file is measuring something else. Passes with or without the fix.
  test("the nav bar keeps the bottom edge of the viewport", async ({ page }) => {
    await startReadingAloud(page)

    const nav = await boxOf(page, NAV_BAR)
    expect(nav.y + nav.height).toBeCloseTo(page.viewportSize()!.height, 0)
  })

  test("the audio panel stops at the top of the nav bar", async ({ page }) => {
    await startReadingAloud(page)

    await eventually(async () => {
      const panel = await boxOf(page, AUDIO_PANEL)
      const nav = await boxOf(page, NAV_BAR)

      expect(
        panel.y + panel.height,
        `panel bottom ${panel.y + panel.height} against nav bar top ${nav.y}`
      ).toBeLessThanOrEqual(nav.y)
    })
  })

  test("every nav tab still takes a tap while an article is being read aloud", async ({
    page,
  }) => {
    await startReadingAloud(page)

    // Reading is the current pane, having just opened an article. Each tap has
    // to land on the tab rather than on the bar drawn over it, and moving
    // aria-current is the proof that it did: the drawer stays mounted and
    // merely translates, so its box tells us nothing.
    for (const label of ["Feeds", "Articles", "Reading"]) {
      const tab = navBar(page).getByRole("button", { name: label, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute("aria-current", "page")
    }
  })

  test("the layout reserves exactly what the two bars draw", async ({ page }) => {
    await startReadingAloud(page)

    await eventually(async () => {
      const row = await boxOf(page, MAIN_ROW)
      const panel = await boxOf(page, AUDIO_PANEL)
      const nav = await boxOf(page, NAV_BAR)

      // No overlap and no gap, in both joints. A gap is the strip of empty
      // background the unfixed layout left; an overlap is content under a bar.
      expect(
        panel.y - (row.y + row.height),
        `main row bottom ${row.y + row.height} against panel top ${panel.y}`
      ).toBeCloseTo(0, 0)
      expect(
        nav.y - (panel.y + panel.height),
        `panel bottom ${panel.y + panel.height} against nav bar top ${nav.y}`
      ).toBeCloseTo(0, 0)
    })
  })
})

test.describe("The audio panel where there is no nav bar", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await expect(navBar(page)).toHaveCount(0)
  })

  // A guard rather than a catcher. The wide arrangement was already right, and
  // is unchanged by the fix in everything but the panel's 1px: before, the
  // panel was pinned to the bottom at 744..800 against a row of `calc(100vh -
  // 56px)`, and after it is pinned there at 743..800 against the same
  // arithmetic in a variable. It is here because the fix puts the panel's
  // bottom edge and its height on variables that differ either side of the
  // 640px breakpoint, and nothing else would notice if the phone's branch
  // reached the wide viewport.
  test("the panel keeps the bottom edge and the row stops at its top", async ({ page }) => {
    await startReadingAloud(page)

    await eventually(async () => {
      const panel = await boxOf(page, AUDIO_PANEL)
      const row = await boxOf(page, MAIN_ROW)

      expect(panel.y + panel.height).toBeCloseTo(page.viewportSize()!.height, 0)
      expect(
        panel.y - (row.y + row.height),
        `main row bottom ${row.y + row.height} against panel top ${panel.y}`
      ).toBeCloseTo(0, 0)
    })
  })
})
