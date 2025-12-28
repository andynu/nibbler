import type { LucideIcon } from "lucide-react"
import { Rss, Clock, Star, Send, FolderMinus, Archive, Sparkles } from "lucide-react"
import type { Feed } from "@/lib/api"

/**
 * Virtual Folder Registry
 *
 * Virtual folders are dynamic views that show feeds or entries based on criteria.
 * Two modes:
 * - "item-list": Shows entries matching criteria (like Fresh, Starred)
 * - "feed-list": Shows feeds matching criteria (like Uncategorized, Dead Letter Box)
 */

export type VirtualFolderMode = "item-list" | "feed-list"

export interface VirtualFolder {
  id: string
  name: string
  icon: LucideIcon
  mode: VirtualFolderMode
  // For feed-list mode: function to filter feeds
  filterFeeds?: (feeds: Feed[]) => Feed[]
  // Optional: custom icon color
  iconColor?: string
  // Whether this is a "smart" folder (shows sparkle indicator)
  isSmart?: boolean
  // Order in the sidebar (lower = higher)
  order: number
}

// Registry of all virtual folders
const virtualFolderRegistry: Map<string, VirtualFolder> = new Map()

// Register a virtual folder
export function registerVirtualFolder(folder: VirtualFolder): void {
  virtualFolderRegistry.set(folder.id, folder)
}

// Get a virtual folder by ID
export function getVirtualFolder(id: string): VirtualFolder | undefined {
  return virtualFolderRegistry.get(id)
}

// Get all virtual folders sorted by order
export function getAllVirtualFolders(): VirtualFolder[] {
  return Array.from(virtualFolderRegistry.values()).sort((a, b) => a.order - b.order)
}

// Get virtual folders by mode
export function getVirtualFoldersByMode(mode: VirtualFolderMode): VirtualFolder[] {
  return getAllVirtualFolders().filter((f) => f.mode === mode)
}

// Check if a virtual folder ID is valid
export function isVirtualFolderId(id: string | null): boolean {
  return id !== null && virtualFolderRegistry.has(id)
}

// ----- Built-in Virtual Folders -----

// All Feeds - shows all entries (special case: id is empty string)
registerVirtualFolder({
  id: "",
  name: "All Feeds",
  icon: Rss,
  mode: "item-list",
  order: 0,
})

// Fresh - shows recent unread entries
registerVirtualFolder({
  id: "fresh",
  name: "Fresh",
  icon: Clock,
  mode: "item-list",
  order: 10,
})

// Starred - shows starred entries
registerVirtualFolder({
  id: "starred",
  name: "Starred",
  icon: Star,
  mode: "item-list",
  iconColor: "var(--color-accent-secondary)",
  order: 20,
})

// Published - shows published entries
registerVirtualFolder({
  id: "published",
  name: "Published",
  icon: Send,
  mode: "item-list",
  order: 30,
})

// ----- Smart Folders (feed-list mode) -----

// Uncategorized - feeds not in any category
registerVirtualFolder({
  id: "uncategorized",
  name: "Uncategorized",
  icon: FolderMinus,
  mode: "feed-list",
  isSmart: true,
  filterFeeds: (feeds: Feed[]) => feeds.filter((f) => f.category_id === null),
  order: 100,
})

// Dead Letter Box - feeds with no posts in 1+ year
registerVirtualFolder({
  id: "dead-letter-box",
  name: "Dead Letter Box",
  icon: Archive,
  mode: "feed-list",
  isSmart: true,
  filterFeeds: (feeds: Feed[]) => {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

    return feeds.filter((f) => {
      if (!f.newest_entry_date) return true // Never published
      const lastPublished = new Date(f.newest_entry_date)
      return lastPublished < oneYearAgo
    })
  },
  order: 110,
})

// Helper component for smart folder icon with sparkle
export function SmartFolderIcon({
  icon: Icon,
  className,
  iconColor,
}: {
  icon: LucideIcon
  className?: string
  iconColor?: string
}) {
  return (
    <span className="relative inline-flex">
      <Icon className={className} style={iconColor ? { color: iconColor } : undefined} />
      <Sparkles
        className="absolute -top-1 -right-1 h-2.5 w-2.5 text-amber-500"
        strokeWidth={2.5}
      />
    </span>
  )
}
