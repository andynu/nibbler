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
  const isMobile = layout.isMobile
  const isOpen = layout.currentPane === "sidebar"

  // Close on escape key.
  //
  // Everything down to the early return has to run on every render, mobile or
  // not. The `!isMobile` return used to sit above these three hooks, so an
  // instance that had rendered on desktop ran none of them and the same
  // instance on mobile ran all three. React does not throw on that here,
  // because useContext takes no slot in the hook list and renderWithHooks
  // treats an empty list as a mount, but the flip back up is unrecoverable:
  // the desktop render consumes none of the hooks the mobile render mounted,
  // so no cleanup runs, the keydown listener stays on the document and
  // body.overflow keeps whatever the drawer last wrote. Unreachable from
  // application.tsx, whose ternary unmounts the drawer rather than re-rendering
  // it, and reachable from any second call site (ttrb-qlpd).
  //
  // The two effects carry the mobile check themselves so desktop behaviour is
  // what it was: no listener attached, nothing written to body.overflow.
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        layout.goToList()
      }
    },
    [isOpen, layout]
  )

  useEffect(() => {
    if (!isMobile) return

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isMobile, handleKeyDown])

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (!isMobile) return

    if (isOpen) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [isMobile, isOpen])

  // Only render the drawer on mobile
  if (!isMobile) {
    return <>{children}</>
  }

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

      {/* Drawer.
          It stops at the top of the nav bar rather than running `inset-y-0` to
          the bottom of the window. Pinned to the window it was 720 tall on a
          720 viewport, so its scroller's last 28 pixels were behind the bar and
          the last feed in the tree could not be tapped at any scroll position -
          the same defect the list and article panes had (ttrb-0apn). The
          drawer only ever renders on mobile, where the bar is always there. */}
      <div
        style={{ bottom: "var(--mobile-nav-height)" }}
        className={cn(
          "fixed top-0 left-0 z-50 w-[85%] max-w-[320px] bg-background shadow-xl transition-transform duration-200 ease-out",
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
