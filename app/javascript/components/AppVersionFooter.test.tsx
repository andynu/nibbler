import { describe, it, expect, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { AppVersionFooter } from "@/components/AppVersionFooter"

const SHA = "b1aea9e61ca553976a0a5b3983539c338b683e99"

function setVersionMeta(content: string) {
  const meta = document.createElement("meta")
  meta.setAttribute("name", "app-version")
  meta.setAttribute("content", content)
  document.head.appendChild(meta)
}

afterEach(() => {
  document.head.querySelectorAll('meta[name="app-version"]').forEach((el) => el.remove())
})

describe("AppVersionFooter", () => {
  it("shows the abbreviated SHA from the meta tag", () => {
    setVersionMeta(SHA)

    render(<AppVersionFooter />)

    expect(screen.getByText("b1aea9e")).toBeInTheDocument()
  })

  it("exposes the full SHA on hover so it can be copied", () => {
    setVersionMeta(SHA)

    render(<AppVersionFooter />)

    expect(screen.getByText("b1aea9e")).toHaveAttribute("title", SHA)
  })

  it("renders nothing when the server reported an unknown build", () => {
    setVersionMeta("unknown")

    const { container } = render(<AppVersionFooter />)

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when the meta tag is absent", () => {
    const { container } = render(<AppVersionFooter />)

    expect(container).toBeEmptyDOMElement()
  })

  it("renders nothing when the meta tag is present but blank", () => {
    setVersionMeta("   ")

    const { container } = render(<AppVersionFooter />)

    expect(container).toBeEmptyDOMElement()
  })
})
