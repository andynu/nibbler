import React from "react"
import { createRoot } from "react-dom/client"
import { Button } from "@/components/ui/button"
import { Rss } from "lucide-react"

function App() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="flex items-center gap-3 mb-8">
          <Rss className="h-8 w-8" />
          <h1 className="text-3xl font-bold">TTRB</h1>
        </div>
        <p className="text-muted-foreground mb-4">
          A modern RSS reader built with Rails and React.
        </p>
        <div className="flex gap-2">
          <Button>Get Started</Button>
          <Button variant="outline">Learn More</Button>
        </div>
      </div>
    </div>
  )
}

document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("react-root")
  if (container) {
    const root = createRoot(container)
    root.render(<App />)
  }
})
