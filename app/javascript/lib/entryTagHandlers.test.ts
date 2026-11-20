import { describe, it, expect, beforeEach, vi } from "vitest"
import type { SetStateAction } from "react"
import type { Entry } from "@/lib/api"

const mockAdd = vi.fn()
const mockRemove = vi.fn()

vi.mock("@/lib/api", () => ({
  api: {
    entryTags: {
      add: (...args: unknown[]) => mockAdd(...args),
      remove: (...args: unknown[]) => mockRemove(...args),
    },
  },
}))

import { entryTagHandlers } from "./entryTagHandlers"

type Tag = NonNullable<Entry["tags"]>[number]

const SCIENCE: Tag = { id: 1, name: "science", fg_color: "#fff", bg_color: "#000" }
const LONGREAD: Tag = { id: 2, name: "longread", fg_color: "#fff", bg_color: "#111" }

function entry(id: number, tags: Tag[] = []): Entry {
  return {
    id,
    entry_id: id,
    feed_id: 1,
    feed_title: "Feed",
    title: `Entry ${id}`,
    link: `https://example.com/${id}`,
    author: "",
    published: "2026-11-20T00:00:00Z",
    unread: false,
    starred: false,
    is_published: false,
    score: 0,
    last_read: null,
    tags,
  }
}

function apply<T>(prev: T, action: SetStateAction<T>): T {
  return typeof action === "function" ? (action as (p: T) => T)(prev) : action
}

/**
 * Stands in for App's state: the list rows and the open article are separate
 * copies of one record, and a tag write has to reach both.
 */
function app(entries: Entry[], selectedId: number) {
  const state = {
    entries,
    selectedEntry: entries.find((e) => e.id === selectedId) ?? null,
    allTags: ["science"],
  }
  const setSelectedEntry = (action: SetStateAction<Entry | null>) => {
    state.selectedEntry = apply(state.selectedEntry, action)
  }
  const setAllTags = (action: SetStateAction<string[]>) => {
    state.allTags = apply(state.allTags, action)
  }
  const handlers = entryTagHandlers({
    selectedEntry: state.selectedEntry,
    setSelectedEntry,
    allTags: state.allTags,
    setAllTags,
  })
  return { state, ...handlers }
}

describe("entryTagHandlers", () => {
  beforeEach(() => {
    mockAdd.mockReset()
    mockRemove.mockReset()
  })

  it("puts an added tag on the open article's list row as well as the pane", async () => {
    mockAdd.mockResolvedValue({ entry_id: 7, tags: [SCIENCE, LONGREAD] })
    const { state, handleAddTag } = app([entry(6), entry(7, [SCIENCE]), entry(8)], 7)

    await handleAddTag("longread")

    expect(mockAdd).toHaveBeenCalledWith(7, "longread")
    expect(state.selectedEntry?.tags).toEqual([SCIENCE, LONGREAD])
    expect(state.entries.find((e) => e.id === 7)?.tags).toEqual([SCIENCE, LONGREAD])
    expect(state.entries.find((e) => e.id === 6)?.tags).toEqual([])
    expect(state.allTags).toEqual(["longread", "science"])
  })

  it("takes a removed tag off the open article's list row as well as the pane", async () => {
    mockRemove.mockResolvedValue({ entry_id: 7, tags: [LONGREAD] })
    const { state, handleRemoveTag } = app([entry(6), entry(7, [SCIENCE, LONGREAD])], 7)

    await handleRemoveTag("science")

    expect(mockRemove).toHaveBeenCalledWith(7, "science")
    expect(state.selectedEntry?.tags).toEqual([LONGREAD])
    expect(state.entries.find((e) => e.id === 7)?.tags).toEqual([LONGREAD])
  })
})
