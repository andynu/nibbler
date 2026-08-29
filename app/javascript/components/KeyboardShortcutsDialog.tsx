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
      <DialogContent className="sm:max-w-2xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and interact with entries using your keyboard.
          </DialogDescription>
        </DialogHeader>
        {/*
          CSS columns rather than a grid: sections keep their natural height and
          the browser balances them, so a section is never split from its
          heading (break-inside-avoid) and a tall section does not stretch a
          whole grid row. The catalog can grow without touching this layout.
        */}
        <div className="columns-1 md:columns-2 lg:columns-3 gap-x-8">
          {sections.map((section) => (
            <div key={section.section} className="break-inside-avoid mb-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {section.section}
              </h3>
              <div className="space-y-1">
                {section.items.map((shortcut) => (
                  <div key={shortcut.id} className="flex items-center justify-between gap-3 py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="shrink-0 px-2 py-1 text-xs font-mono bg-muted rounded border">
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
