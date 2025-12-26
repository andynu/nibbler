# TTRSS Preferences Checklist

Select which preferences to include in TTRB. Based on TTRSS `classes/Prefs.php`.

- legend
- [x] include this as a configurable option
- [y] we will include a feature like this but we will use the defualt value and it will not be configurable.
- [-] we will not include this feature.

---

## Feed Management

- [x] **PURGE_OLD_DAYS** (default: 60) — Days to keep old articles before purging
- [x] **PURGE_UNREAD_ARTICLES** (default: true) — Also purge unread articles when purging old
- [x] **DEFAULT_UPDATE_INTERVAL** (default: 30 min) — Default feed update interval for new feeds
- [y] **ENABLE_FEED_CATS** (default: true) — Enable categories/folders for organizing feeds
- [-] **BLACKLISTED_TAGS** (default: "main, generic, misc...") — Tags to ignore when importing from feeds

---

## Article Display

- [-] **COMBINED_DISPLAY_MODE** (default: true) — Show article content inline with headlines (vs separate pane)
- [-] **CDM_EXPANDED** (default: true) — In combined mode, expand articles by default
- [-] **CDM_ENABLE_GRID** (default: false) — Grid/card layout instead of list
- [y] **WIDESCREEN_MODE** (default: false) — Optimize layout for wide screens
- [x] **SHOW_CONTENT_PREVIEW** (default: true) — Show content snippet in headline list
- [x] **STRIP_IMAGES** (default: false) — Remove images from article content
- [y] **VFEED_GROUP_BY_FEED** (default: false) — Group articles by feed in virtual feeds (All, Fresh, etc.)

---

## Reading Behavior

- [x] **CDM_AUTO_CATCHUP** (default: false) — Auto-mark articles read when scrolled past
- [x] **CONFIRM_FEED_CATCHUP** (default: true) — Confirm before marking all as read
- [y] **ON_CATCHUP_SHOW_NEXT_FEED** (default: false) — After catchup, auto-navigate to next feed
- [y] **REVERSE_HEADLINES** (default: false) — Show oldest articles first (We will have sorting more easily configured in the listing pane.
- [x] **_DEFAULT_VIEW_MODE** (default: "adaptive") — Default article filter (all, unread, adaptive, marked, etc.)
- [x] **_DEFAULT_VIEW_LIMIT** (default: 30) — Articles per page
- [y] **_DEFAULT_VIEW_ORDER_BY** (default: "default") — Sort order for articles (We will remember what the setting is globally, no need to have an item in the settings pane on it, we will just persis the seelection of sorting in the listing ui)
- [y] **_DEFAULT_INCLUDE_CHILDREN** (default: false) — Include child category feeds when viewing parent

---

## Feed Sidebar

- [x] **HIDE_READ_FEEDS** (default: false) — Hide feeds with no unread articles (Again should be easily togglable via button or context menu in the list ui)
- [x] **HIDE_READ_SHOWS_SPECIAL** (default: true) — Still show special feeds when hiding read
- [x] **FEEDS_SORT_BY_UNREAD** (default: false) — Sort feeds by unread count instead of alphabetically (So this is an override of the feed soring, we may talk about having multi level sorting like you find in email, (e.g. selectable columsnf or soring, read, created_at, feed title, etc)

---

## Fresh Articles

- [x] **FRESH_ARTICLE_MAX_AGE** (default: 24 hours) — Max age for "Fresh" virtual feed

---

## Date/Time

- [x] **USER_TIMEZONE** (default: "Automatic") — User's timezone
- [x] **SHORT_DATE_FORMAT** (default: "M d, G:i") — Short date format string
- [x] **LONG_DATE_FORMAT** (default: "D, M d Y - G:i") — Long date format string

---

## Appearance

- [x] **USER_CSS_THEME** (default: "") — Selected theme name
- [x] **USER_STYLESHEET** (default: "") — Custom CSS to inject
- [x] **USER_LANGUAGE** (default: "") — UI language

---

## Search

- [x] **DEFAULT_SEARCH_LANGUAGE** (default: "") — Default language for full-text search

---

## Email Digest

- [x] **DIGEST_ENABLE** (default: false) — Enable daily email digest
- [x] **DIGEST_PREFERRED_TIME** (default: "00:00") — Preferred time to receive digest
- [x] **DIGEST_CATCHUP** (default: false) — Mark articles as read after including in digest
- [x] **DIGEST_MIN_SCORE** (default: 0) — Minimum article score to include in digest

---

## Notes

**Commented out in TTRSS source (deprecated/removed):**
- ~~ALLOW_DUPLICATE_POSTS~~
- ~~DEFAULT_ARTICLE_LIMIT~~
- ~~STRIP_UNSAFE_TAGS~~
- ~~_COLLAPSED_SPECIAL/LABELS/UNCAT/FEEDLIST~~
- ~~_MOBILE_*~~ (various mobile-specific prefs)
- ~~_THEME_ID~~
- ~~SORT_HEADLINES_BY_FEED_DATE~~
- ~~_PREFS_SHOW_EMPTY_CATS~~
- ~~AUTO_ASSIGN_LABELS~~

---

## Suggested MVP Set

Andy: Definitely include these.

These would give a functional reader with good UX:

```
✓ PURGE_OLD_DAYS
✓ COMBINED_DISPLAY_MODE
✓ CDM_EXPANDED
✓ CDM_AUTO_CATCHUP
✓ CONFIRM_FEED_CATCHUP
✓ HIDE_READ_FEEDS
✓ FRESH_ARTICLE_MAX_AGE
✓ USER_TIMEZONE
✓ USER_CSS_THEME
```
