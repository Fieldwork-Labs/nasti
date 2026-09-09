import { describe, expect, it } from "vitest"

import { ROLE } from "@nasti/common/types"
import { landingRoute } from "@/utils/permissions"
import { getLoginRedirect } from "./loginRedirect"

describe("getLoginRedirect", () => {
  it("preserves the original no-access destination", () => {
    expect(getLoginRedirect("/no-access")).toBe("/no-access")
  })

  it("falls back to the root landing route when no destination was supplied", () => {
    expect(getLoginRedirect()).toBe("/")
  })

  it("rejects external destinations", () => {
    expect(getLoginRedirect("https://example.com")).toBe("/")
  })

  it("lets the root route land an inventory-only member in Inventory", () => {
    expect(
      landingRoute({ role: ROLE.MEMBER, permissions: ["inventory"] }),
    ).toBe("/inventory")
  })
})
