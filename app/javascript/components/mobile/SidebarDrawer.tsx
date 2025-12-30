import { useEffect, useCallback, ReactNode } from "react"
import { useLayout } from "@/contexts/LayoutContext"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface SidebarDrawerProps {
  children: ReactNode
}

export function SidebarDrawer({ children }: SidebarDrawerProps) {
  const layout = useLayout()

  // Only render on mobile
  if (!layout.isMobile) {
    return <>{children}</>
  }

  const isOpen = layout.currentPane === "sidebar"

  // Close on escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        layout.goToList()
      }
    },
    [isOpen, layout]
  )

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isOpen])

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => layout.goToList()}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[85%] max-w-[320px] bg-background shadow-xl transition-transform duration-200 ease-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Feed sidebar"
      >
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 z-10"
          onClick={() => layout.goToList()}
          aria-label="Close sidebar"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* Sidebar content */}
        <div className="h-full overflow-hidden">
          {children}
        </div>
      </div>
    </>
  )
}
