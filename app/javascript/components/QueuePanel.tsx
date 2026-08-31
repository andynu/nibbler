import { useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAudioPlayer } from "@/contexts/AudioPlayerContext"
import type { QueueItem } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  Bot,
  Headphones,
  GripVertical,
  X,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Play,
} from "lucide-react"
import { useState } from "react"

interface SortableQueueItemProps {
  item: QueueItem
  index: number
  isPlaying: boolean
  onRemove: (id: string) => void
  onPlay: (index: number) => void
}

function SortableQueueItem({ item, index, isPlaying, onRemove, onPlay }: SortableQueueItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-md",
        "border border-transparent",
        isPlaying && "bg-primary/10 border-primary/30",
        isDragging && "opacity-50",
        !isPlaying && "hover:bg-muted/50"
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Source icon */}
      {item.source === "tts" ? (
        <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
      ) : (
        <Headphones className="h-4 w-4 text-muted-foreground shrink-0" />
      )}

      {/* Title and feed */}
      <button
        className="flex-1 min-w-0 text-left"
        onClick={() => onPlay(index)}
      >
        <div className="truncate text-sm font-medium" title={item.entryTitle}>
          {item.entryTitle}
        </div>
        {item.feedTitle && (
          <div className="truncate text-xs text-muted-foreground" title={item.feedTitle}>
            {item.feedTitle}
          </div>
        )}
      </button>

      {/* Status indicator */}
      <div className="shrink-0">
        {item.status === "generating" && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {item.status === "ready" && (
          <CheckCircle2 className="h-4 w-4 text-success" />
        )}
        {item.status === "error" && (
          <AlertCircle className="h-4 w-4 text-destructive-text" />
        )}
        {item.status === "pending" && item.source === "tts" && (
          <span className="text-xs text-muted-foreground">pending</span>
        )}
      </div>

      {/* Playing indicator or play button.

          The button is drawn unconditionally. It used to be `opacity-0` until
          a `group-hover` on the row wrapper revealed it, which a touch device
          never fires: the control stayed invisible on a phone while still
          answering a tap and still sitting in the accessibility tree
          (ttrb-0sg7). It is the control ttrb-6hxv points at when it sheds skip
          next and skip previous from the audio panel below xs, on the argument
          that a phone skips by tapping a queue row, so it has to be visible
          there. Its neighbour, the remove button, was never gated this way. */}
      {isPlaying ? (
        <div className="shrink-0">
          <Play className="h-4 w-4 text-primary fill-primary" />
        </div>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation()
            onPlay(index)
          }}
          aria-label="Play this item"
        >
          <Play className="h-3 w-3" />
        </Button>
      )}

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive-text"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(item.id)
        }}
        aria-label="Remove from queue"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

function DragOverlayItem({ item }: { item: QueueItem }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background border shadow-lg">
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      {item.source === "tts" ? (
        <Bot className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Headphones className="h-4 w-4 text-muted-foreground" />
      )}
      <div className="truncate text-sm font-medium">{item.entryTitle}</div>
    </div>
  )
}

export function QueuePanel() {
  const {
    queue,
    currentQueueIndex,
    isQueuePanelOpen,
    toggleQueuePanel,
    removeFromQueue,
    clearQueue,
    reorderQueue,
    playQueueItem,
  } = useAudioPlayer()

  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const activeItem = useMemo(
    () => queue.find((item) => item.id === activeId),
    [queue, activeId]
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)

    if (over && active.id !== over.id) {
      const oldIndex = queue.findIndex((item) => item.id === active.id)
      const newIndex = queue.findIndex((item) => item.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderQueue(oldIndex, newIndex)
      }
    }
  }

  if (!isQueuePanelOpen) {
    return null
  }

  // Sits on the audio panel, wherever that is. A `bottom-14` here put it 56px
  // up from the bottom of the window, which was the panel's own height only
  // while the panel was pinned to the bottom; on a phone the panel now stands
  // on the nav bar and this has to clear both (ttrb-8k7e).
  return (
    <div
      style={{ bottom: "calc(var(--audio-panel-bottom) + var(--audio-panel-height))" }}
      className={cn(
        "fixed left-0 right-0 z-40",
        "bg-background border-t border-border",
        "shadow-lg",
        "max-h-[50vh]",
        "flex flex-col"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Queue</h3>
          <span className="text-sm text-muted-foreground">
            {queue.length} {queue.length === 1 ? "item" : "items"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {queue.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearQueue}
              className="text-muted-foreground hover:text-destructive-text"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleQueuePanel}
            aria-label="Close queue panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Queue list */}
      {queue.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          Queue is empty. Add articles or podcasts to listen.
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={queue.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {/* No `group` wrapper around each row: the only rule that
                      read it was the play button's `group-hover`, and that
                      button is drawn unconditionally now (ttrb-0sg7). */}
                  {queue.map((item, index) => (
                    <SortableQueueItem
                      key={item.id}
                      item={item}
                      index={index}
                      isPlaying={index === currentQueueIndex}
                      onRemove={removeFromQueue}
                      onPlay={playQueueItem}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeItem ? <DragOverlayItem item={activeItem} /> : null}
              </DragOverlay>
            </DndContext>
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
