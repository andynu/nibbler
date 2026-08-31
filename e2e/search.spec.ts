import { test, expect, type Page } from "./fixtures"

/**
 * Article search, end to end.
 *
 * Every example here runs a real query through `/api/v1/search`, which means
 * `websearch_to_tsquery`, the `entries.tsvector_combined` generated column, its
 * GIN index and `ts_headline`, and then asserts on the rows that came back. The
 * component suite mocks `api.search`, so it cannot tell a working index from an
 * empty one: `Entry.search` returned nothing at all for every query in
 * production for months while every one of those tests stayed green. An example
 * that would still pass against an empty index is not pulling its weight here,
 * so each one below names a specific headline the query has to find or exclude
 * rather than counting rows alone or asserting the app did not crash.
 *
 * The fixture set is `lib/e2e_dataset.rb`: four feeds of six articles each,
 * indexes 4 and 5 read, index 1 starred, all published inside the last 14
 * hours. Each article's body repeats its own headline and names its feed
 * ("... from Rust Weekly, used by the end-to-end suite"), so a term like
 * "keyword" that appears only in that shared prose matches all 24 articles and
 * can only be found through the body, never the headline.
 */

/** Rust Weekly's six headlines, newest first, which is also seeding order. */
const RUST_HEADLINES_NEWEST_FIRST = [
  "Rust 1.90 stabilises const generics",
  "A tour of the borrow checker",
  "Writing a parser with nom",
  "Cargo workspaces in large repos",
  "Async runtimes compared",
  "Embedded Rust on the RP2040",
]

/** The two Rust Weekly articles the fixture set seeds as already read. */
const READ_RUST_HEADLINES = ["Async runtimes compared", "Embedded Rust on the RP2040"]

/**
 * A term that appears only in the shared prose of every seeded body, so it
 * matches all 24 articles and whatever comes back was decided by the scope
 * alone. A headline search could never find it.
 */
const MATCHES_EVERY_BODY = "keyword"

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Search articles" })
}

function searchResults(page: Page) {
  return page.getByRole("listbox", { name: "Search results" })
}

function searchRows(page: Page) {
  return searchResults(page).getByRole("option")
}

function searchRow(page: Page, headline: string) {
  return searchRows(page).filter({ hasText: headline })
}

/**
 * Hits still showing as unread.
 *
 * A search row says "unread" with a left border and a filled dot, neither of
 * which reaches the accessibility tree, and unlike the entry list's rows it
 * carries no `data-unread` attribute to read instead (ttrb-p7ya). The class is
 * the only signal there is.
 */
function unreadSearchRows(page: Page) {
  return searchResults(page).locator('[role="option"].border-l-2')
}

function entryList(page: Page) {
  return page.getByRole("listbox", { name: "Entries" })
}

/** The single scope pill on offer. Only one axis narrows in the views used here. */
function scopePill(page: Page) {
  return page.getByRole("group", { name: "Search scope" }).getByRole("button")
}

/** The entry list's title bar heading, which names the current selection. */
function entryListTitle(page: Page) {
  return page.getByRole("heading", { level: 2 }).first()
}

/**
 * The sidebar button that selects the seeded "Rust Weekly" feed. Filtered by
 * text rather than by name: the button is named "Rust Weekly 4" (title plus
 * unread badge) and its row also holds a "Rust Weekly menu" button and an
 * unnamed dnd-kit drag handle.
 */
function seededFeedButton(page: Page) {
  return page
    .getByRole("navigation", { name: "Feeds" })
    .getByRole("button")
    .filter({ hasText: "Rust Weekly" })
}

/** The Fresh toolbar's two selects, each named by the label beside it. */
function freshTimeSelect(page: Page) {
  return page.getByRole("combobox", { name: "time: range" })
}

function freshPerFeedSelect(page: Page) {
  return page.getByRole("combobox", { name: "per: feed" })
}

/** The headlines on screen, in the order the server ranked them. */
async function resultHeadlines(page: Page): Promise<string[]> {
  const rows = await searchRows(page).allInnerTexts()
  return rows.map((row) => row.split("\n")[0].trim())
}

/** Focus the box the way a reader does, and put a query in it. */
async function runSearch(page: Page, query: string) {
  await page.keyboard.press("/")
  await expect(searchBox(page)).toBeFocused()
  await searchBox(page).fill(query)
}

test.describe("Opening the search box", () => {
  test("`/` focuses the box and a query replaces the list with hits from the index", async ({
    authenticatedPage: page,
  }) => {
    await expect(entryList(page).getByRole("option")).toHaveCount(24)

    await runSearch(page, "heliopause")

    await expect(searchRows(page)).toHaveCount(1)
    expect(await resultHeadlines(page)).toEqual(["Mapping the heliopause"])
    // The hits took the list's place rather than appearing beside it.
    await expect(entryList(page)).toHaveCount(0)
    // The excerpt is the one ts_headline cut out of the stored body: this
    // sentence is in entries.content and in no headline anywhere.
    await expect(searchRows(page).first()).toContainText("Seeded article 2 from Deep Space")
    // And the term came back delimited by the server, not found by a substring
    // scan on the client.
    await expect(searchRows(page).first().locator("mark").first()).toHaveText(/heliopause/i)
  })

  test("Escape empties the box, puts the scope back and returns the list", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, MATCHES_EVERY_BODY)
    await expect(searchRows(page)).toHaveCount(6)
    await expect(scopePill(page)).toHaveText("Rust Weekly")

    // Widen first, so Escape has a scope to put back and not just a box to empty.
    await scopePill(page).click()
    await expect(searchRows(page)).toHaveCount(24)
    await expect(scopePill(page)).toHaveText("All feeds")

    // The pill has focus now, so `/` is what gets the cursor back in the box.
    await page.keyboard.press("/")
    await expect(searchBox(page)).toBeFocused()
    await page.keyboard.press("Escape")

    await expect(searchBox(page)).toHaveValue("")
    await expect(searchResults(page)).toHaveCount(0)
    await expect(entryList(page).getByRole("option")).toHaveCount(6)

    // The same query again comes back narrowed to the feed, so the widening did
    // not survive the clear.
    await searchBox(page).fill(MATCHES_EVERY_BODY)
    await expect(searchRows(page)).toHaveCount(6)
    await expect(scopePill(page)).toHaveText("Rust Weekly")
  })
})

test.describe("Scope: which feeds the search covers", () => {
  // "heliopause or generics" matches exactly one article in each of two feeds,
  // so the place axis is the only thing that can decide how many come back.
  const CROSS_FEED_QUERY = "heliopause or generics"
  const IN_RUST_WEEKLY = "Rust 1.90 stabilises const generics"
  const IN_DEEP_SPACE = "Mapping the heliopause"

  test("a search inside a feed returns only that feed's matches until the pill widens it", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, CROSS_FEED_QUERY)
    await expect(searchRows(page)).toHaveCount(1)
    expect(await resultHeadlines(page)).toEqual([IN_RUST_WEEKLY])
    await expect(scopePill(page)).toHaveText("Rust Weekly")

    await scopePill(page).click()
    await expect(searchRows(page)).toHaveCount(2)
    await expect(searchRow(page, IN_DEEP_SPACE)).toBeVisible()
    await expect(scopePill(page)).toHaveText("All feeds")

    // And back: the pill narrows as well as widens.
    await scopePill(page).click()
    await expect(searchRows(page)).toHaveCount(1)
    await expect(searchRow(page, IN_DEEP_SPACE)).toHaveCount(0)
    await expect(scopePill(page)).toHaveText("Rust Weekly")
  })

  test("Alt+A widens without the cursor leaving the box", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, CROSS_FEED_QUERY)
    await expect(searchRows(page)).toHaveCount(1)

    await page.keyboard.press("Alt+a")

    await expect(searchRows(page)).toHaveCount(2)
    await expect(searchRow(page, IN_DEEP_SPACE)).toBeVisible()
    await expect(scopePill(page)).toHaveText("All feeds")
    await expect(searchBox(page)).toBeFocused()
    // The shortcut was swallowed rather than typed into the query.
    await expect(searchBox(page)).toHaveValue(CROSS_FEED_QUERY)
  })

  test("an empty narrowed search offers the matches it would find everywhere", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, "heliopause")

    // Nothing here, and the empty state blames the scope by name.
    await expect(page.getByText(/No matches for .*heliopause.* in Rust Weekly/)).toBeVisible()

    // The count comes from a second, unscoped request, so it is a real total.
    const widenOffer = page.getByRole("button", { name: "1 match in all articles" })
    await expect(widenOffer).toBeVisible()

    await widenOffer.click()
    await expect(searchRows(page)).toHaveCount(1)
    expect(await resultHeadlines(page)).toEqual([IN_DEEP_SPACE])
  })
})

test.describe("Scope: how far back the search reaches", () => {
  // Fresh is unread plus an age window, so the two read Rust Weekly articles
  // are outside it and the four unread ones are in.
  const UNREAD_RUST_COUNT = 4

  test("Fresh hides a read match until the history pill is pressed", async ({
    feedsPage,
    page,
  }) => {
    await feedsPage.selectFresh()
    await expect(entryListTitle(page)).toHaveText("Fresh")

    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(UNREAD_RUST_COUNT)
    for (const headline of READ_RUST_HEADLINES) {
      await expect(searchRow(page, headline)).toHaveCount(0)
    }
    await expect(scopePill(page)).toHaveText("Fresh")

    await scopePill(page).click()

    await expect(searchRows(page)).toHaveCount(6)
    for (const headline of READ_RUST_HEADLINES) {
      await expect(searchRow(page, headline)).toBeVisible()
    }
    await expect(scopePill(page)).toHaveText("All history")
  })

  test("Alt+H reaches the read articles from inside the box", async ({ feedsPage, page }) => {
    await feedsPage.selectFresh()
    await expect(entryListTitle(page)).toHaveText("Fresh")

    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(UNREAD_RUST_COUNT)

    await page.keyboard.press("Alt+h")

    await expect(searchRows(page)).toHaveCount(6)
    await expect(searchRow(page, "Embedded Rust on the RP2040")).toBeVisible()
    await expect(scopePill(page)).toHaveText("All history")
    await expect(searchBox(page)).toBeFocused()
    await expect(searchBox(page)).toHaveValue("rust")
  })
})

test.describe("Scope: the Fresh toolbar", () => {
  // Fresh keeps the 16 unread articles, 4 per feed, all of which match.
  const FOURTH_NEWEST_UNREAD = "Cargo workspaces in large repos"

  test("the per-feed cap applies to the hits as well as to the list", async ({
    feedsPage,
    page,
  }) => {
    await feedsPage.selectFresh()
    await expect(entryListTitle(page)).toHaveText("Fresh")

    await runSearch(page, MATCHES_EVERY_BODY)
    await expect(searchRows(page)).toHaveCount(16)
    await expect(searchRow(page, FOURTH_NEWEST_UNREAD)).toBeVisible()

    // Three per feed: the fourth-newest unread article of every feed goes.
    await freshPerFeedSelect(page).selectOption("3")
    await expect(searchRows(page)).toHaveCount(12)
    await expect(searchRow(page, FOURTH_NEWEST_UNREAD)).toHaveCount(0)

    await freshPerFeedSelect(page).selectOption("5")
    await expect(searchRows(page)).toHaveCount(16)
    await expect(searchRow(page, FOURTH_NEWEST_UNREAD)).toBeVisible()
  })

  test("the time selector travels with the query", async ({ feedsPage, page }) => {
    await feedsPage.selectFresh()
    await expect(entryListTitle(page)).toHaveText("Fresh")

    await runSearch(page, MATCHES_EVERY_BODY)
    await expect(searchRows(page)).toHaveCount(16)

    // Every seeded article is inside 24 hours, so no window the toolbar offers
    // can change which ones match. What is checkable is that the selection
    // reaches the search request and not only the entry list's, which is the
    // failure buildSearchParams' Fresh branch exists to prevent.
    const searchWithMonth = page.waitForRequest(
      (request) =>
        request.url().includes("/api/v1/search") &&
        request.url().includes("fresh_max_age=month")
    )
    await freshTimeSelect(page).selectOption("month")
    await searchWithMonth

    await expect(searchRows(page)).toHaveCount(16)
    await expect(searchRow(page, "Mapping the heliopause")).toBeVisible()
  })
})

test.describe("Sorting a result set", () => {
  test("hits arrive by relevance and the Date header reorders them", async ({
    authenticatedPage: page,
  }) => {
    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(6)

    // Search brought its own columns: relevance is offered, score is not.
    await expect(page.getByRole("button", { name: "Relevance" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Score" })).toHaveCount(0)

    // ts_rank puts the two articles with "Rust" in the headline above the four
    // that only mention the feed in their body. One of the two is the oldest of
    // the six, so no date ordering could have produced this pair.
    const topTwo = (await resultHeadlines(page)).slice(0, 2).sort()
    expect(topTwo).toEqual([
      "Embedded Rust on the RP2040",
      "Rust 1.90 stabilises const generics",
    ])

    await page.getByRole("button", { name: "Date" }).click()
    await expect.poll(() => resultHeadlines(page)).toEqual(RUST_HEADLINES_NEWEST_FIRST)

    // A second click asks for the other direction, and the server obeys.
    await page.getByRole("button", { name: "Date" }).click()
    await expect
      .poll(() => resultHeadlines(page))
      .toEqual([...RUST_HEADLINES_NEWEST_FIRST].reverse())
  })

  test("the search's sort is its own and the list keeps the one it had", async ({
    feedsPage,
    page,
  }) => {
    // Put the entry list on a sort of its own. Z-A over the fixture set starts
    // at "YJIT in production" whatever collation the server runs.
    await page.getByRole("button", { name: "Title" }).click()
    await expect
      .poll(async () => (await feedsPage.getEntryTitles())[0])
      .toBe("YJIT in production")
    const listOrder = await feedsPage.getEntryTitles()

    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(6)
    // The search did not inherit Title (Z-A), which would have led with
    // "Writing a parser with nom".
    expect((await resultHeadlines(page))[0]).not.toBe("Writing a parser with nom")

    // Re-sorting the hits must not touch the list's own ordering.
    await page.getByRole("button", { name: "Date" }).click()
    await expect.poll(() => resultHeadlines(page)).toEqual(RUST_HEADLINES_NEWEST_FIRST)

    // The sort header has focus after that click, and Escape only clears the
    // box when the box is what it lands on.
    await page.keyboard.press("/")
    await expect(searchBox(page)).toBeFocused()
    await page.keyboard.press("Escape")

    await expect(searchResults(page)).toHaveCount(0)
    await expect.poll(() => feedsPage.getEntryTitles()).toEqual(listOrder)
    await expect(page.getByRole("button", { name: "Score" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Relevance" })).toHaveCount(0)
  })
})

test.describe("Query syntax", () => {
  test("a -term excludes what the same query without it returns", async ({
    authenticatedPage: page,
  }) => {
    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(6)
    await expect(searchRow(page, "Embedded Rust on the RP2040")).toBeVisible()

    await searchBox(page).fill("rust -embedded")

    await expect(searchRows(page)).toHaveCount(5)
    await expect(searchRow(page, "Embedded Rust on the RP2040")).toHaveCount(0)
  })

  test("a quoted phrase requires the words in that order", async ({
    authenticatedPage: page,
  }) => {
    await runSearch(page, "checker borrow")

    // Unquoted, the two words are ANDed and their order does not matter.
    await expect(searchRows(page)).toHaveCount(1)
    expect(await resultHeadlines(page)).toEqual(["A tour of the borrow checker"])

    await searchBox(page).fill('"checker borrow"')

    // Quoted, they have to be adjacent in that order, which they never are.
    await expect(searchResults(page)).toHaveCount(0)
    await expect(page.getByText(/No matches for/)).toBeVisible()
  })

  test("a query that only says what to leave out is refused, not silently empty", async ({
    authenticatedPage: page,
  }) => {
    await runSearch(page, "-wombat")

    await expect(page.getByText(/Add a word to search for/)).toBeVisible()
    await expect(page.getByText(/only says what to leave out/)).toBeVisible()
    await expect(searchResults(page)).toHaveCount(0)
  })
})

test.describe("A hit the reader changes under the search", () => {
  const UNREAD_UNSTARRED = "Writing a parser with nom"

  test("opening a hit marks the row read, and m puts it back", async ({
    authenticatedPage: page,
  }) => {
    await runSearch(page, "rust")
    await expect(searchRows(page)).toHaveCount(6)

    const row = searchRow(page, UNREAD_UNSTARRED)
    await expect(row).toHaveClass(/border-l-2/)

    await row.click()
    await expect(page.getByRole("article")).toBeVisible()

    // The row the reader just clicked stops claiming to be unread, without the
    // search being re-run under them.
    await expect(row).not.toHaveClass(/border-l-2/)
    await expect(searchRows(page)).toHaveCount(6)

    // `m` toggles it back, through the other handler that patches search rows.
    await page.keyboard.press("m")
    await expect(row).toHaveClass(/border-l-2/)
  })

  test("s stars a hit and the row grows a star", async ({ authenticatedPage: page }) => {
    await runSearch(page, "rust")
    const row = searchRow(page, UNREAD_UNSTARRED)
    // The star is the one row state with an accessible name of its own.
    const star = row.locator('[aria-label="Starred"]')
    await expect(star).toHaveCount(0)

    await row.click()
    await expect(page.getByRole("article")).toBeVisible()

    await page.keyboard.press("s")
    await expect(star).toBeVisible()

    await page.keyboard.press("s")
    await expect(star).toHaveCount(0)
  })

  test("mark read sweeps every hit when the search is still on the list's scope", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, MATCHES_EVERY_BODY)
    await expect(searchRows(page)).toHaveCount(6)
    await expect(unreadSearchRows(page)).toHaveCount(4)

    await markAllRead(page)

    // Every hit was inside the swept scope, so every row follows.
    await expect(unreadSearchRows(page)).toHaveCount(0)
    await expect(searchRows(page)).toHaveCount(6)
  })

  test("mark read leaves the hits a widened search brought in from elsewhere", async ({
    authenticatedPage: page,
  }) => {
    await seededFeedButton(page).click()
    await expect(entryListTitle(page)).toHaveText("Rust Weekly")

    await runSearch(page, MATCHES_EVERY_BODY)
    await scopePill(page).click()
    await expect(searchRows(page)).toHaveCount(24)
    await expect(unreadSearchRows(page)).toHaveCount(16)

    await markAllRead(page)

    // The sweep reached Rust Weekly's four, and nothing outside it: the other
    // three feeds keep their four unread each.
    await expect(unreadSearchRows(page)).toHaveCount(12)
    for (const headline of RUST_HEADLINES_NEWEST_FIRST) {
      await expect(searchRow(page, headline)).not.toHaveClass(/border-l-2/)
    }
  })
})

/** The list header's sweep, through its confirmation. */
async function markAllRead(page: Page) {
  // Exact: /mark.*read/i also matches the per-entry "Mark as read" buttons.
  await page.getByRole("button", { name: "Mark read", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("heading", { name: "Mark all as read?" })).toBeVisible()
  await dialog.getByRole("button", { name: "Mark as read" }).click()
}
