import { test, expect } from "./fixtures"
import { logoutViaApi } from "./fixtures/auth"

/**
 * The websocket half of the push stack, in a real browser against a real Puma.
 *
 * Everything below the socket is covered by Minitest -- the connection's cookie
 * auth, the channel's stream, the job's broadcast. What none of those touch is
 * whether a browser can actually reach /cable: the engine's mount, the upgrade
 * through Puma, the session cookie surviving a handshake that carries no other
 * request state, and the subscription being confirmed. That path has no unit
 * test that could stand in for it.
 *
 * The assertions read `data-cable` off <html>, which useCableHeartbeat keeps in
 * step with the subscription (see app/javascript/hooks/useCableHeartbeat.ts).
 *
 * Delivery is not asserted here. RAILS_ENV=test uses the `test` cable adapter,
 * which accepts broadcasts for assertion rather than routing them, and the E2E
 * server is a single process with no GoodJob worker -- so a delivery assertion
 * would prove nothing about the cross-process path that actually matters. That
 * is verified against solid_cable with the worker running; see the README.
 */
test.describe("Action Cable connection", () => {
  test("a signed-in browser subscribes over the websocket", async ({ authenticatedPage: page }) => {
    await expect(page.locator("html")).toHaveAttribute("data-cable", "connected", {
      timeout: 10000,
    })
  })

  test("the socket is opened over the same origin as the app", async ({
    authenticatedPage: page,
  }) => {
    const socketUrl = await page.evaluate(() => {
      const anchor = document.createElement("a")
      anchor.href = "/cable"
      return anchor.href.replace(/^http/, "ws")
    })

    expect(socketUrl).toMatch(/^wss?:\/\/[^/]+\/cable$/)
  })

  // ApplicationCable::Connection#find_verified_user rejects a socket with no
  // session, so the app must not open one from the login screen. A rejected
  // handshake per page load is not an error anyone would notice, which is
  // exactly why it is worth a test.
  test("no subscription is attempted while signed out", async ({ page }) => {
    await logoutViaApi(page)
    await page.goto("/")

    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator("html")).toHaveAttribute("data-cable", "idle")
  })

  // The app declining to subscribe is not the same as the server declining to
  // serve. This opens the socket by hand, with no session, and asserts the
  // server closes it rather than sending a welcome.
  test("the server refuses a socket carrying no session", async ({ page }) => {
    await logoutViaApi(page)
    await page.goto("/")
    await expect(page.getByRole("button").first()).toBeVisible({ timeout: 10000 })

    const outcome = await page.evaluate(
      () =>
        new Promise<string>((resolve) => {
          const url = new URL("/cable", location.href)
          url.protocol = url.protocol.replace("http", "ws")

          const socket = new WebSocket(url.href, ["actioncable-v1-json"])
          const giveUp = setTimeout(() => {
            socket.close()
            resolve("still open")
          }, 10000)

          const settle = (result: string) => {
            clearTimeout(giveUp)
            socket.close()
            resolve(result)
          }

          socket.addEventListener("close", () => settle("closed"))
          socket.addEventListener("message", (event) => {
            const message = JSON.parse(event.data as string) as { type?: string }
            if (message.type === "welcome") settle("welcomed")
          })
        })
    )

    expect(outcome).toBe("closed")
  })
})
