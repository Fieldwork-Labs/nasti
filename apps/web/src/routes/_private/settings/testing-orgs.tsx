import { createFileRoute } from "@tanstack/react-router"
import { useAdminOnly } from "@/hooks/useAdminOnly"
import { TestingOrgsManagement } from "@/components/testing-orgs/TestingOrgsManagement"
import { TestingOrgLinks } from "@/components/testing-orgs/TestingOrgLinks"
import useUserStore from "@/store/userStore"

export const Route = createFileRoute("/_private/settings/testing-orgs")({
  component: TestingOrgsPage,
})

function TestingOrgsPage() {
  useAdminOnly()
  const { organisation } = useUserStore()

  // Show different interface based on organisation type
  const isTestingOrg = organisation?.type === "Testing"

  return (
    <div className="container mx-auto p-6">
      {isTestingOrg ? <TestingOrgLinks /> : <TestingOrgsManagement />}
    </div>
  )
}
