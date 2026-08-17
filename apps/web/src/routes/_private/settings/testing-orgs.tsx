import { createFileRoute } from "@tanstack/react-router"
import { TestingOrgsManagement } from "@/components/testing-orgs/TestingOrgsManagement"
import { TestingOrgLinks } from "@/components/testing-orgs/TestingOrgLinks"
import useUserStore from "@/store/userStore"

export const Route = createFileRoute("/_private/settings/testing-orgs")({
  component: TestingOrgsPage,
})

function TestingOrgsPage() {
  const { organisation } = useUserStore()

  const isTestingProvider = organisation?.is_testing_provider

  return (
    <div className="container mx-auto p-6">
      {isTestingProvider && <TestingOrgLinks />}
      <TestingOrgsManagement />
    </div>
  )
}
