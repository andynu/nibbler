import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { shortcutsBySection } from "@/lib/keyboardShortcuts"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
  // Rendered from the shared catalog so the dialog cannot drift from the
  // bindings registered in application.tsx.
  const sections = shortcutsBySection()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and interact with entries using your keyboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {sections.map((section) => (
            <div key={section.section}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {section.section}
              </h3>
              <div className="space-y-1">
                {section.items.map((shortcut) => (
                  <div key={shortcut.id} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                      {shortcut.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
