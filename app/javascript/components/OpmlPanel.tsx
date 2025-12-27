import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Upload, Download, FileCheck, AlertCircle, CheckCircle2 } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface OpmlPanelProps {
  onImportComplete?: () => void
}

interface PreviewFeed {
  title: string
  feed_url: string
  site_url: string
  category_path: string
  exists: boolean
}

interface PreviewResult {
  feeds: PreviewFeed[]
  total: number
  new_feeds: number
  existing_feeds: number
  errors: string[]
}

interface ImportResult {
  success: boolean
  summary: string
  feeds_created: number
  feeds_skipped: number
  categories_created: number
  errors?: string[]
}

export function OpmlPanel({ onImportComplete }: OpmlPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setSelectedFile(file)
    setError(null)
    setPreview(null)
    setImportResult(null)
    setIsLoading(true)

    try {
      const result = await api.opml.preview(file)
      setPreview(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse OPML file")
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!selectedFile) return

    setIsLoading(true)
    setError(null)

    try {
      const result = await api.opml.import(selectedFile)
      setImportResult(result)
      setPreview(null)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      onImportComplete?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleExport = () => {
    window.location.href = api.opml.exportUrl()
  }

  const handleReset = () => {
    setPreview(null)
    setImportResult(null)
    setError(null)
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-2">Import Feeds</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Import your subscriptions from another RSS reader using an OPML file.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".opml,.xml"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!preview && !importResult && (
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {isLoading ? "Loading..." : "Select OPML File"}
          </Button>
        )}

        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">
                Found {preview.total} feeds:
              </span>
              <span className="text-green-600">
                {preview.new_feeds} new
              </span>
              <span className="text-yellow-600">
                {preview.existing_feeds} already subscribed
              </span>
            </div>

            {preview.errors.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm font-medium text-yellow-800 mb-1">
                  Warnings:
                </p>
                <ul className="text-sm text-yellow-700 list-disc pl-4">
                  {preview.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <ScrollArea className="h-64 border rounded-md">
              <div className="p-2">
                {preview.feeds.map((feed, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-2 py-2 px-2 rounded",
                      feed.exists ? "opacity-50" : ""
                    )}
                  >
                    <FileCheck className={cn(
                      "h-4 w-4 shrink-0",
                      feed.exists ? "text-muted-foreground" : "text-green-600"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{feed.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {feed.category_path || "Uncategorized"} &middot; {feed.feed_url}
                      </p>
                    </div>
                    {feed.exists && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        exists
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex gap-2">
              <Button onClick={handleImport} disabled={isLoading || preview.new_feeds === 0}>
                {isLoading ? "Importing..." : `Import ${preview.new_feeds} Feeds`}
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {importResult && (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-md flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800">Import Complete</p>
                <p className="text-sm text-green-700 mt-1">{importResult.summary}</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleReset}>
              Import More
            </Button>
          </div>
        )}
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-medium mb-2">Export Feeds</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Download your subscriptions as an OPML file to use in another RSS reader.
        </p>
        <Button variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Download OPML
        </Button>
      </div>
    </div>
  )
}
