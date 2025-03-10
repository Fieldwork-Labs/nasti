import { InvitationForm } from "@/components/invitations/InvitationForm"
import { createFileRoute } from "@tanstack/react-router"

const InvitationFormPage = () => (
  <div className="mt-6 flex flex-col gap-4 pb-6 sm:w-full md:w-1/2 lg:w-1/3">
    <div>
      <h4 className="mb-2 text-xl font-bold">New invitation</h4>
      <p>Invite organisation members to NASTI</p>
    </div>
    <InvitationForm />
  </div>
)

export const Route = createFileRoute("/_private/invitations/new")({
  component: InvitationFormPage,
})
