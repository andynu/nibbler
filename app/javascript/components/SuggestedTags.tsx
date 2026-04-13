import { useState, useEffect, useRef, useCallback } from "react"
import { api } from "@/lib/api"
import { getTagColor } from "@/lib/tag-colors"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Tag, Plus } from "lucide-react"

interface SuggestedTagsProps {
  entryId: number
  existingTags: string[]
  allTags?: string[]
  onAddTag: (name: string) => Promise<void>
  onRemoveTag: (name: string) => Promise<void>
}

export function SuggestedTags({ entryId, existingTags, allTags = [], onAddTag, onRemoveTag }: SuggestedTagsProps) {
  const [topWords, setTopWords] = useState<Array<{ word: string; count: number }>>([])
  const [loading, setLoading] = useState(true)
  const [pendingWord, setPendingWord] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    api.entries.info(entryId)
      .then((info) => {
        if (!cancelled) {
          setTopWords(info.top_words || [])
        }
      })
      .catch((err) => {
        console.error("Failed to fetch entry info:", err)
        if (!cancelled) {
          setTopWords([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [entryId])

  // Normalize existing tags for comparison
  const existingTagsLower = new Set(
    (existingTags || []).filter(Boolean).map((t) => t.toLowerCase())
  )

  // Filter word suggestions: not already applied, count > 1
  const suggestions = topWords.filter(
    ({ word, count }) =>
      count > 1 &&
      word &&
      !existingTagsLower.has(word.toLowerCase())
  )

  // Filter allTags for the popover dropdown
  const tagSuggestions = allTags.filter(
    (tag) =>
      !existingTagsLower.has(tag.toLowerCase()) &&
      tag.toLowerCase().includes(inputValue.toLowerCase())
  )

  // Check if input value is a new tag (not in allTags)
  const isNewTag =
    inputValue.trim() &&
    !allTags.some(t => t.toLowerCase() === inputValue.toLowerCase().trim()) &&
    !existingTagsLower.has(inputValue.toLowerCase().trim())

  const handleAddTag = async (word: string) => {
    setPendingWord(word)
    try {
      await onAddTag(word)
    } catch (err) {
      console.error("Failed to add tag:", err)
    } finally {
      setPendingWord(null)
    }
  }

  const handleRemoveTag = async (word: string) => {
    setPendingWord(word)
    try {
      await onRemoveTag(word)
    } catch (err) {
      console.error("Failed to remove tag:", err)
    } finally {
      setPendingWord(null)
    }
  }

  const handleAddTagFromPopover = useCallback(
    async (tagName: string) => {
      const normalized = tagName.toLowerCase().trim()
      if (!normalized || existingTagsLower.has(normalized) || isAdding) return

      setIsAdding(true)
      try {
        await onAddTag(normalized)
        setInputValue("")
        setOpen(false)
      } finally {
        setIsAdding(false)
      }
    },
    [existingTagsLower, onAddTag, isAdding]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault()
      handleAddTagFromPopover(inputValue)
    }
  }

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {/* Applied tags - filled style, click to remove */}
      {existingTags.filter(Boolean).map((tag) => {
        const colors = getTagColor(tag)
        const isPending = pendingWord === tag
        return (
          <button
            key={`applied-${tag}`}
            onClick={() => handleRemoveTag(tag)}
            disabled={isPending}
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-xs transition-colors",
              "hover:opacity-80",
              isPending && "opacity-50 cursor-wait"
            )}
            style={{
              backgroundColor: colors.bg,
              color: colors.fg,
            }}
            title={`Remove "${tag}" tag`}
          >
            {tag}
          </button>
        )
      })}

      {/* Suggested tags - outline style, click to add */}
      {suggestions.map(({ word, count }) => {
        const colors = getTagColor(word)
        const isPending = pendingWord === word
        return (
          <button
            key={`suggest-${word}`}
            onClick={() => handleAddTag(word)}
            disabled={isPending}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border",
              "hover:ring-2 hover:ring-offset-1",
              isPending && "opacity-50 cursor-wait"
            )}
            style={{
              backgroundColor: `${colors.bg}20`,
              color: colors.bg,
              borderColor: `${colors.bg}40`,
            }}
            title={`Add "${word}" as a tag`}
          >
            {word}
            <span className="opacity-60">{count}</span>
          </button>
        )
      })}

      {/* Add tag button */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors border",
              "border-muted-foreground/30 text-muted-foreground",
              "hover:border-muted-foreground/50 hover:text-foreground"
            )}
          >
            <Plus className="h-3 w-3" />
            add tag
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              ref={inputRef}
              placeholder="Type or select a tag..."
              value={inputValue}
              onValueChange={setInputValue}
              onKeyDown={handleKeyDown}
            />
            <CommandList>
              <CommandEmpty>
                {inputValue.trim() ? (
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-sm text-left hover:bg-accent rounded cursor-pointer"
                    onClick={() => handleAddTagFromPopover(inputValue)}
                    disabled={isAdding}
                  >
                    Create "{inputValue.trim()}"
                  </button>
                ) : (
                  "No tags yet"
                )}
              </CommandEmpty>
              <CommandGroup>
                {isNewTag && (
                  <CommandItem
                    value={`create-${inputValue}`}
                    onSelect={() => handleAddTagFromPopover(inputValue)}
                    disabled={isAdding}
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    Create "{inputValue.trim()}"
                  </CommandItem>
                )}
                {tagSuggestions.map((tag) => (
                  <CommandItem
                    key={tag}
                    value={tag}
                    onSelect={() => handleAddTagFromPopover(tag)}
                    disabled={isAdding}
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    {tag}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
