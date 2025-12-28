import { useState, useRef, useEffect, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Tag, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface TagEditorProps {
  tags: string[]
  allTags: string[]
  onAddTag: (tag: string) => Promise<void>
  onRemoveTag: (tag: string) => Promise<void>
  disabled?: boolean
}

export function TagEditor({
  tags,
  allTags,
  onAddTag,
  onRemoveTag,
  disabled = false,
}: TagEditorProps) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const [isAdding, setIsAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter suggestions: show all tags that aren't already applied and match input
  const suggestions = allTags.filter(
    (tag) =>
      !tags.includes(tag) &&
      tag.toLowerCase().includes(inputValue.toLowerCase())
  )

  // Check if input value is a new tag (not in allTags)
  const isNewTag =
    inputValue.trim() &&
    !allTags.includes(inputValue.toLowerCase().trim()) &&
    !tags.includes(inputValue.toLowerCase().trim())

  const handleAddTag = useCallback(
    async (tagName: string) => {
      const normalized = tagName.toLowerCase().trim()
      if (!normalized || tags.includes(normalized) || isAdding) return

      setIsAdding(true)
      try {
        await onAddTag(normalized)
        setInputValue("")
      } finally {
        setIsAdding(false)
      }
    },
    [tags, onAddTag, isAdding]
  )

  const handleRemoveTag = async (tagName: string) => {
    await onRemoveTag(tagName)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && inputValue.trim()) {
      e.preventDefault()
      handleAddTag(inputValue)
    }
  }

  // Focus input when popover opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="pr-1 gap-1"
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              className="ml-1 rounded-full hover:bg-muted p-0.5"
              onClick={() => handleRemoveTag(tag)}
              aria-label={`Remove tag ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      {!disabled && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add tag
            </Button>
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
                      onClick={() => handleAddTag(inputValue)}
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
                      onSelect={() => handleAddTag(inputValue)}
                      disabled={isAdding}
                    >
                      <Tag className="h-4 w-4 mr-2" />
                      Create "{inputValue.trim()}"
                    </CommandItem>
                  )}
                  {suggestions.map((tag) => (
                    <CommandItem
                      key={tag}
                      value={tag}
                      onSelect={() => handleAddTag(tag)}
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
      )}

      {tags.length === 0 && disabled && (
        <span className="text-xs text-muted-foreground">No tags</span>
      )}
    </div>
  )
}
