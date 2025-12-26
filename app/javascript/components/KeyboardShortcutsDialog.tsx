import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface KeyboardShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const shortcuts = [
  { category: "Navigation", items: [
    { key: "j / n", description: "Next entry" },
    { key: "k / p", description: "Previous entry" },
  ]},
  { category: "Actions", items: [
    { key: "o / Enter", description: "Open entry" },
    { key: "m", description: "Toggle read/unread" },
    { key: "s", description: "Toggle starred" },
    { key: "r", description: "Refresh entries" },
  ]},
  { category: "Other", items: [
    { key: "Escape", description: "Close/deselect entry" },
    { key: "?", description: "Show keyboard shortcuts" },
  ]},
]

export function KeyboardShortcutsDialog({ open, onOpenChange }: KeyboardShortcutsDialogProps) {
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
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((shortcut) => (
                  <div key={shortcut.key} className="flex items-center justify-between py-1">
                    <span className="text-sm">{shortcut.description}</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                      {shortcut.key}
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
