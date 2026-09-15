import { CommandItem } from "@/components/ui/command"
import { CategoryWithPath } from "@/lib/categoryPaths"
import { Folder, Check } from "lucide-react"

interface CategoryPathItemProps
  extends Omit<React.ComponentPropsWithoutRef<typeof CommandItem>, "children" | "className"> {
  item: CategoryWithPath
  /**
   * The deepest level the indent expresses. Each picker sets its own, since
   * the width a level of indent costs depends on the picker's container.
   */
  maxIndentDepth: number
  checked: boolean
}

/**
 * One category row in a searchable picker: folder icon, the ancestor path,
 * then the title, indented by depth up to `maxIndentDepth`.
 */
export function CategoryPathItem({
  item,
  maxIndentDepth,
  checked,
  ...commandItemProps
}: CategoryPathItemProps) {
  return (
    <CommandItem {...commandItemProps} className="flex items-center">
      <span
        style={{ paddingLeft: `${Math.min(item.depth, maxIndentDepth) * 12}px` }}
        className="flex items-center"
      >
        <Folder className="mr-2 h-4 w-4" />
        {item.depth > 0 ? (
          <span className="text-muted-foreground text-xs mr-1">
            {item.path.slice(0, -1).join(" / ")} /
          </span>
        ) : null}
        <span>{item.category.title}</span>
      </span>
      {checked && <Check className="ml-auto h-4 w-4" />}
    </CommandItem>
  )
}
