import { createFileRoute } from "@tanstack/react-router"
import useUserStore from "@/store/userStore"

// Where a member with neither permission ends up. They have a valid account
// and organisation, there is simply nothing they are allowed to open yet.
const NoAccessPage = () => {
  const { organisation } = useUserStore()

  return (
    <div className="mt-6 flex-col pb-6 sm:w-full">
      <div className="rounded-lg border-2 p-6 text-lg md:w-1/2">
        <h4 className="mb-2 text-xl font-bold">No areas assigned</h4>
        <p>
          Your account with {organisation?.name ?? "this organisation"} does not
          have access to any area of NASTI yet.
        </p>
        <p className="mt-2">
          Ask an administrator to grant you Collections or Inventory access.
        </p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_private/no-access")({
  component: NoAccessPage,
})
