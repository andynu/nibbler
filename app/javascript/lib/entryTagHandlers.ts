import type { Dispatch, SetStateAction } from "react"
import { api, type Entry } from "@/lib/api"

export interface EntryTagHandlerDeps {
  selectedEntry: Entry | null
  setSelectedEntry: Dispatch<SetStateAction<Entry | null>>
  allTags: string[]
  setAllTags: Dispatch<SetStateAction<string[]>>
}

export interface EntryTagHandlers {
  handleAddTag: (tagName: string) => Promise<void>
  handleRemoveTag: (tagName: string) => Promise<void>
}

/** Add and remove tags on the open article. Both rethrow so the tag input can show the failure. */
export function entryTagHandlers({ selectedEntry, setSelectedEntry, allTags, setAllTags }: EntryTagHandlerDeps): EntryTagHandlers {
  const handleAddTag = async (tagName: string) => {
    if (!selectedEntry) return
    const entryId = selectedEntry.id
    try {
      const result = await api.entryTags.add(entryId, tagName)
      setSelectedEntry((prev) => (prev?.id === entryId ? { ...prev, tags: result.tags } : prev))
      // If this is a new tag, add it to allTags
      const normalizedName = tagName.toLowerCase()
      if (!allTags?.includes(normalizedName)) {
        setAllTags((prev) => [...(prev || []), normalizedName].sort())
      }
    } catch (error) {
      console.error("Failed to add tag:", error)
      throw error
    }
  }

  const handleRemoveTag = async (tagName: string) => {
    if (!selectedEntry) return
    const entryId = selectedEntry.id
    try {
      const result = await api.entryTags.remove(entryId, tagName)
      setSelectedEntry((prev) => (prev?.id === entryId ? { ...prev, tags: result.tags } : prev))
    } catch (error) {
      console.error("Failed to remove tag:", error)
      throw error
    }
  }

  return { handleAddTag, handleRemoveTag }
}
