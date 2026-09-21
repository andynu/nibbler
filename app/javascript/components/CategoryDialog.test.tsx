import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi } from "vitest"
import { CategoryDialog } from "./CategoryDialog"
import { Category } from "@/lib/api"
import { mockCategory } from "../../../test/fixtures/data"

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual("@/lib/api")
  return {
    ...actual,
    api: {
      categories: {
        create: vi.fn(),
        update: vi.fn(),
      },
    },
  }
})

describe("CategoryDialog", () => {
  // Technology > Programming > Rust, with News alongside as an unrelated root.
  const technology = mockCategory({ id: 1, title: "Technology" })
  const programming = mockCategory({ id: 2, title: "Programming", parent_id: 1 })
  const rust = mockCategory({ id: 3, title: "Rust", parent_id: 2 })
  const news = mockCategory({ id: 4, title: "News" })
  const categories: Category[] = [technology, programming, rust, news]

  function renderDialog(category: Category | null) {
    return render(
      <CategoryDialog
        open={true}
        onOpenChange={vi.fn()}
        category={category}
        categories={categories}
        onCategoryCreated={vi.fn()}
        onCategoryUpdated={vi.fn()}
      />
    )
  }

  async function parentOptionNames() {
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: /parent category/i }))
    return screen
      .getAllByRole("option")
      .map((option) => option.textContent?.trim() ?? "")
  }

  it("offers every category as a parent when creating a new one", async () => {
    renderDialog(null)

    expect(await parentOptionNames()).toEqual([
      "No parent (top level)",
      "Technology",
      "Programming",
      "Rust",
      "News",
    ])
  })

  it("withholds the category being edited and everything below it", async () => {
    renderDialog(technology)

    // Parenting Technology to Programming or Rust would close a loop with no
    // root, which hangs the Move Feed and Edit Feed pickers.
    expect(await parentOptionNames()).toEqual([
      "No parent (top level)",
      "News",
    ])
  })

  it("still offers a category's own ancestors, which are above it", async () => {
    renderDialog(rust)

    expect(await parentOptionNames()).toEqual([
      "No parent (top level)",
      "Technology",
      "Programming",
      "News",
    ])
  })
})
