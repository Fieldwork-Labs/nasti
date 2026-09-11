import { describe, it, expect, afterEach } from "vitest"
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react"
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
} from "@tanstack/react-router"

import { useUnsavedChangesPrompt } from "../useUnsavedChangesPrompt"
import { UnsavedChangesDialog } from "@/components/common/UnsavedChangesDialog"

const FormScreen = ({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) => {
  const navigate = useNavigate()
  const { isPromptOpen, discardChanges, keepEditing } = useUnsavedChangesPrompt(
    { hasUnsavedChanges },
  )

  return (
    <div>
      <span>Form screen</span>
      <button onClick={() => navigate({ to: "/" })}>Cancel</button>
      <UnsavedChangesDialog
        open={isPromptOpen}
        onDiscard={discardChanges}
        onKeepEditing={keepEditing}
      />
    </div>
  )
}

const renderForm = async (hasUnsavedChanges: boolean) => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <span>Trip screen</span>,
  })
  const formRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/form",
    component: () => <FormScreen hasUnsavedChanges={hasUnsavedChanges} />,
  })
  // the blocker relies on browser history - memory history has no blockers
  window.history.replaceState(null, "", "/form")
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, formRoute]),
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render(<RouterProvider router={router as any} />)
  await screen.findByText("Form screen")
}

afterEach(() => {
  cleanup()
})

describe("useUnsavedChangesPrompt", () => {
  it("lets navigation through when there are no unsaved changes", async () => {
    await renderForm(false)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText("Trip screen")).toBeDefined()
  })

  it("prompts before leaving when there are unsaved changes", async () => {
    await renderForm(true)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByText("Discard unsaved changes?")).toBeDefined()
    expect(screen.queryByText("Trip screen")).toBeNull()
  })

  it("stays on the form when the user keeps editing", async () => {
    await renderForm(true)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.click(await screen.findByRole("button", { name: "Keep editing" }))

    await waitFor(() =>
      expect(screen.queryByText("Discard unsaved changes?")).toBeNull(),
    )
    expect(screen.getByText("Form screen")).toBeDefined()
    expect(screen.queryByText("Trip screen")).toBeNull()
  })

  it("prompts on back navigation, eg. the hardware back button", async () => {
    await renderForm(true)

    window.history.back()

    expect(await screen.findByText("Discard unsaved changes?")).toBeDefined()
    expect(screen.getByText("Form screen")).toBeDefined()
  })

  it("navigates away when the user discards the changes", async () => {
    await renderForm(true)

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }))

    expect(await screen.findByText("Trip screen")).toBeDefined()
  })
})
