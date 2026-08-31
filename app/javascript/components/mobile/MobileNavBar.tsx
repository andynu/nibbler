import { useLayout } from "@/contexts/LayoutContext"
import { Button } from "@/components/ui/button"
import { FolderTree, List, FileText } from "lucide-react"
import { cn } from "@/lib/utils"

interface MobileNavBarProps {
  hasSelectedEntry?: boolean
}

export function MobileNavBar({ hasSelectedEntry = false }: MobileNavBarProps) {
  const layout = useLayout()

  // Only render on mobile
  if (!layout.isMobile) {
    return null
  }

  const tabs = [
    {
      id: "sidebar" as const,
      label: "Feeds",
      icon: FolderTree,
    },
    {
      id: "list" as const,
      label: "Articles",
      icon: List,
    },
    {
      id: "content" as const,
      label: "Reading",
      icon: FileText,
      disabled: !hasSelectedEntry,
    },
  ]

  // The height comes from --mobile-nav-height (application.tailwind.css)
  // rather than from an h-14 here, because the panes have to reserve exactly
  // this much room and a second literal is a second thing to forget. Box sizing
  // is border-box, so the declared height covers the border and the safe-area
  // padding, leaving the nav its 56px row.
  return (
    <div
      data-testid="mobile-nav-bar"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background safe-area-bottom"
      style={{ height: "var(--mobile-nav-height)" }}
    >
      <nav className="flex h-full items-center justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = layout.currentPane === tab.id

          return (
            <Button
              key={tab.id}
              variant="ghost"
              className={cn(
                "flex-1 flex-col gap-1 h-12 rounded-lg",
                isActive && "bg-accent text-accent-foreground"
              )}
              style={isActive ? {
                backgroundColor: "var(--color-accent-primary)",
                color: "white",
              } : undefined}
              onClick={() => layout.setCurrentPane(tab.id)}
              disabled={tab.disabled}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{tab.label}</span>
            </Button>
          )
        })}
      </nav>
    </div>
  )
}
