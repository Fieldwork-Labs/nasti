import { describe, it, expect, afterEach } from "vitest"
import { cleanup, render, screen, fireEvent } from "@testing-library/react"
import { useEffect } from "react"

import { ExtraFieldsAccordion } from "../ExtraFieldsAccordion"

let mountCount = 0

const Child = () => {
  useEffect(() => {
    mountCount += 1
  }, [])
  return <span>child content</span>
}

const renderAccordion = () => {
  mountCount = 0
  render(
    <ExtraFieldsAccordion>
      <Child />
    </ExtraFieldsAccordion>,
  )
  return screen.getByRole("button", { name: /extra fields/i })
}

afterEach(() => {
  cleanup()
})

describe("ExtraFieldsAccordion", () => {
  it("starts collapsed", () => {
    const toggle = renderAccordion()

    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(
      screen.getByText("child content").closest("div")?.className,
    ).toContain("hidden")
  })

  it("reveals its fields when opened", () => {
    const toggle = renderAccordion()

    fireEvent.click(toggle)

    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(
      screen.getByText("child content").closest("div")?.className,
    ).not.toContain("hidden")
  })

  // photo and audio fields keep pending files in local state, so collapsing the
  // accordion must not unmount them
  it("keeps its fields mounted while collapsed", () => {
    const toggle = renderAccordion()

    fireEvent.click(toggle)
    fireEvent.click(toggle)

    expect(mountCount).toBe(1)
    expect(screen.getByText("child content")).toBeDefined()
  })
})
