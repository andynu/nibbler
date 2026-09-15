import { test, expect, stubTtsAudio, type Page } from "./fixtures"

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

/**
 * The seek bar is a focusable role=slider, which promises the WAI-ARIA slider
 * keys. The clip is paused so the readout holds still under each assertion.
 * End is covered by the component test only: a clip seeked to its end advances
 * the queue and takes the panel away.
 */
test.describe("Seeking from the keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await startReadingAloud(page)

    // Exact: at this width "Go to playing item" is on the row and contains "Play".
    await page.getByRole("button", { name: "Pause", exact: true }).click()
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible()
    await seekBar(page).focus()
  })

  test("the arrow, Page and Home keys move the clip by their steps", async ({ page }) => {
    const panel = page.getByTestId(AUDIO_PANEL)
    const steps: Array<[key: string, readout: string]> = [
      ["Home", "0:00"],
      ["ArrowRight", "0:05"],
      ["ArrowUp", "0:10"],
      ["PageUp", "0:40"],
      ["ArrowLeft", "0:35"],
      ["ArrowDown", "0:30"],
      ["PageDown", "0:00"],
    ]

    for (const [key, readout] of steps) {
      await page.keyboard.press(key)
      await expect(panel, `readout after ${key}`).toContainText(`${readout} / 1:00`)
    }
  })

  test("the bar reads its position in words", async ({ page }) => {
    await page.keyboard.press("Home")
    await page.keyboard.press("PageUp")

    await expect(seekBar(page)).toHaveAttribute("aria-valuetext", "30 seconds of 1 minute")
  })

  test("a key the bar handles never reaches a document listener", async ({ page }) => {
    // The app's shortcuts are a document keydown listener (useKeyboardCommands),
    // and this one stands in for it. x is bound to nothing; it shows the
    // stand-in is live and that the bar lets unhandled keys through.
    const seen = await page.evaluateHandle(() => {
      const keys: string[] = []
      document.addEventListener("keydown", (event) => keys.push(event.key))
      return keys
    })

    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "PageDown", "PageUp", "Home"]) {
      await page.keyboard.press(key)
    }
    await page.keyboard.press("x")

    expect(await seen.jsonValue()).toEqual(["x"])
  })
})

/**
 * The queue is where the audio panel sends a phone reader for skip next and
 * skip previous, so the row has to offer the control it is credited with.
 *
 * Its play button was `opacity-0` until a `group-hover` on the row wrapper
 * revealed it (ttrb-0sg7). A touch device fires no hover, so on a phone the
 * button was invisible for the whole life of the panel while still taking a
 * tap and still appearing to a screen reader.
 *
 * `toBeVisible()` does not see this: Playwright calls a fully transparent
 * element with a box visible, and clicks it happily. The computed opacity is
 * what says whether a reader can find the control, so that is what this reads,
 * with the pointer parked in the corner so no hover is in effect.
 */
test.describe("The queue panel's rows on a 320px phone", () => {
  test.use({ viewport: { width: 320, height: 720 } })

  test.beforeEach(async ({ page }) => {
    await stubTtsAudio(page)
    await page.goto("/")
    await expect(page.getByTestId("app-root")).toBeVisible({ timeout: 10000 })
    await startReadingAloud(page)
  })

  test("the play button on a queued row is drawn without a hover", async ({ page }) => {
    // A second item, so that a row exists which is not the one playing: the
    // playing row draws a static indicator in that slot instead of a button.
    // The article being read aloud hides its own two TTS controls, so the
    // presence of "Add to queue" is itself the proof that the next entry has
    // loaded - no separate wait needed.
    await page.getByRole("button", { name: "Next entry" }).click()
    await page.getByRole("button", { name: "Add to queue" }).click()

    await page.getByRole("button", { name: "Open queue" }).click()

    const playRow = page.getByRole("button", { name: "Play this item" })
    await expect(playRow).toHaveCount(1)

    // Away from the row, so nothing here is answered by a hover the previous
    // click left behind.
    await page.mouse.move(0, 0)

    await expect(playRow).toHaveCSS("opacity", "1")

    const box = await playRow.boundingBox()
    expect(box, "expected the play button to be laid out").not.toBeNull()
    expect(box!.width, "play button width").toBeGreaterThan(0)
    expect(box!.height, "play button height").toBeGreaterThan(0)
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

  // The width budget above assumes this button is on the row. It never was:
  // the provider ran the handler App registered as a state updater instead of
  // storing it, so the button's condition was always false.
  test("the jump-to-source button goes back to the article being read", async ({ page }) => {
    const heading = page.getByRole("heading", { level: 1 })
    const playing = await heading.textContent()
    expect(playing, "expected the article being read aloud to have a title").toBeTruthy()

    await entryRows(page).nth(1).click()
    await expect(heading).not.toHaveText(playing!)

    await page.getByRole("button", { name: "Go to playing item" }).click()

    await expect(heading).toHaveText(playing!)
  })
})
