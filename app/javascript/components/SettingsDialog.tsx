import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { FeedOrganizer } from "@/components/FeedOrganizer"
import { PreferencesPanel } from "@/components/PreferencesPanel"
import { FilterManager } from "@/components/FilterManager"
import { LabelManager } from "@/components/LabelManager"
import { OpmlPanel } from "@/components/OpmlPanel"
import { ToolsPanel } from "@/components/ToolsPanel"
import { Feed, Category, api } from "@/lib/api"

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feeds: Feed[]
  categories: Category[]
  onFeedsChange: (feeds: Feed[]) => void
  onCategoriesChange: (categories: Category[]) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  feeds,
  categories,
  onFeedsChange,
  onCategoriesChange,
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState("feeds")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="feeds">Feeds</TabsTrigger>
            <TabsTrigger value="filters">Filters</TabsTrigger>
            <TabsTrigger value="labels">Labels</TabsTrigger>
            <TabsTrigger value="opml">Import/Export</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="account">Account</TabsTrigger>
          </TabsList>
          <TabsContent
            value="feeds"
            className="flex-1 overflow-hidden border rounded-md"
          >
            <FeedOrganizer
              feeds={feeds}
              categories={categories}
              onFeedsChange={onFeedsChange}
              onCategoriesChange={onCategoriesChange}
            />
          </TabsContent>
          <TabsContent
            value="filters"
            className="flex-1 overflow-hidden border rounded-md"
          >
            <FilterManager feeds={feeds} categories={categories} />
          </TabsContent>
          <TabsContent
            value="labels"
            className="flex-1 overflow-hidden border rounded-md"
          >
            <LabelManager />
          </TabsContent>
          <TabsContent
            value="opml"
            className="flex-1 overflow-auto border rounded-md"
          >
            <OpmlPanel
              onImportComplete={async () => {
                const [feedsData, categoriesData] = await Promise.all([
                  api.feeds.list(),
                  api.categories.list(),
                ])
                onFeedsChange(feedsData)
                onCategoriesChange(categoriesData)
              }}
            />
          </TabsContent>
          <TabsContent value="tools" className="flex-1 overflow-auto border rounded-md">
            <ToolsPanel />
          </TabsContent>
          <TabsContent value="preferences" className="flex-1 overflow-auto">
            <PreferencesPanel />
          </TabsContent>
          <TabsContent value="account" className="flex-1">
            <div className="p-4 text-muted-foreground">
              Account settings coming soon...
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
