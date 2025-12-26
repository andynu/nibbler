import { useEffect, useState, useCallback } from "react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Feed, Category } from "@/lib/api"
import { Rss, Folder, Star, Clock } from "lucide-react"

export interface CommandPaletteItem {
  id: string
  label: string
  icon?: React.ReactNode
  shortcut?: string
  group?: string
  onSelect: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  placeholder?: string
  items?: CommandPaletteItem[]
  feeds?: Feed[]
  categories?: Category[]
  onSelectFeed?: (feedId: number) => void
  onSelectCategory?: (categoryId: number) => void
  onSelectVirtualFeed?: (feed: "starred" | "fresh") => void
  mode?: "commands" | "navigation" | "move"
}

export function CommandPalette({
  open,
  onOpenChange,
  placeholder = "Type a command or search...",
  items = [],
  feeds = [],
  categories = [],
  onSelectFeed,
  onSelectCategory,
  onSelectVirtualFeed,
  mode = "navigation",
}: CommandPaletteProps) {
  const handleSelect = useCallback((callback: () => void) => {
    callback()
    onOpenChange(false)
  }, [onOpenChange])

  // Group items by their group property
  const groupedItems = items.reduce((acc, item) => {
    const group = item.group || "Commands"
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(item)
    return acc
  }, {} as Record<string, CommandPaletteItem[]>)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={placeholder} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Virtual feeds */}
        {mode === "navigation" && onSelectVirtualFeed && (
          <CommandGroup heading="Views">
            <CommandItem
              onSelect={() => handleSelect(() => onSelectVirtualFeed("fresh"))}
            >
              <Clock className="mr-2 h-4 w-4" />
              Fresh
            </CommandItem>
            <CommandItem
              onSelect={() => handleSelect(() => onSelectVirtualFeed("starred"))}
            >
              <Star className="mr-2 h-4 w-4" />
              Starred
            </CommandItem>
          </CommandGroup>
        )}

        {/* Categories */}
        {(mode === "navigation" || mode === "move") && categories.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Categories">
              {categories.map((category) => (
                <CommandItem
                  key={`category-${category.id}`}
                  onSelect={() =>
                    handleSelect(() => onSelectCategory?.(category.id))
                  }
                >
                  <Folder className="mr-2 h-4 w-4" />
                  {category.title}
                  {category.unread_count > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {category.unread_count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Feeds */}
        {mode === "navigation" && feeds.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Feeds">
              {feeds.map((feed) => (
                <CommandItem
                  key={`feed-${feed.id}`}
                  onSelect={() => handleSelect(() => onSelectFeed?.(feed.id))}
                >
                  {feed.icon_url ? (
                    <img src={feed.icon_url} className="mr-2 h-4 w-4" alt="" />
                  ) : (
                    <Rss className="mr-2 h-4 w-4" />
                  )}
                  {feed.title}
                  {feed.unread_count > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {feed.unread_count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Custom command items */}
        {Object.entries(groupedItems).map(([group, groupItems]) => (
          <CommandGroup key={group} heading={group}>
            {groupItems.map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => handleSelect(item.onSelect)}
              >
                {item.icon}
                <span className={item.icon ? "ml-2" : ""}>{item.label}</span>
                {item.shortcut && (
                  <CommandShortcut>{item.shortcut}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

// Hook to trigger command palette with keyboard shortcut
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to open command palette
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }

    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return { open, setOpen }
}
