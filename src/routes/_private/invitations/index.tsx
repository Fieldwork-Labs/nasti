import { useCallback, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { ArrowLeftIcon, PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonLink } from "@/components/ui/buttonLink"
import { Modal } from "@/components/ui/modal"
import { useAdminOnly } from "@/hooks/useAdminOnly"

const InvitationsList = () => {
  useAdminOnly()
  const { orgId } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // Fetch invitations
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invitations", orgId],
    queryFn: async () => {
      if (!orgId) {
        throw new Error("Organisation not found")
      }
      const { data: invitations, error } = await supabase
        .from("invitation")
        .select("*")
        .eq("organisation_id", orgId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)

      return invitations
    },
    enabled: Boolean(orgId), // Only run if org
  })

  const [invitationToDelete, setInvitationToDelete] = useState<string>()

  // Modify handleDelete to be the actual deletion logic
  const handleDelete = useCallback(
    async (id: string) => {
      const invitation = data?.find((inv) => inv.id === id)
      if (invitation?.accepted_at) {
        toast({
          variant: "destructive",
          description: "Cannot delete accepted invitation.",
        })
        return
      }
      const { error } = await supabase.from("invitation").delete().eq("id", id)
      if (error) {
        toast({
          variant: "destructive",
          description: `Failed to delete invitation: ${error.message}`,
        })
      } else {
        toast({ description: "Invitation deleted successfully." })
        queryClient.invalidateQueries({ queryKey: ["invitations", orgId] })
      }
      setInvitationToDelete(undefined) // Close modal after deletion
    },
    [data, orgId, queryClient, toast],
  )
  // Handle resending an invitation
  const handleResend = useCallback(
    async (id: string) => {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resend_invitation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ invitation_id: id }),
        },
      )

      if (response.ok) {
        toast({ description: "Invitation resent successfully." })

        queryClient.invalidateQueries({ queryKey: ["invitations", orgId] })
      } else {
        const errorText = await response.text()
        toast({
          description: `Failed to resend invitation: ${errorText}`,
          variant: "destructive",
        })
      }
    },
    [orgId, queryClient, toast],
  )

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading invitations...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">Invitations</h2>
        <ButtonLink to="/invitations/new" className="flex gap-1">
          <PlusIcon aria-label="New Invitation" size={16} /> <span>New</span>
        </ButtonLink>
      </div>
      <Link
        to="/people"
        className="flex items-center gap-2 text-sm text-secondary-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        <span>People List</span>
      </Link>
      {!data || data.length === 0 ? (
        <p>No invitations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full overflow-hidden rounded-lg">
            <thead className="">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Expires</th>
                <th className="px-4 py-2 text-left">Accepted</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((invitation) => (
                <tr key={invitation.id} className="border-t">
                  <td className="px-4 py-2">{invitation.name}</td>
                  <td className="px-4 py-2">{invitation.email}</td>
                  <td className="px-4 py-2">
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2",
                      invitation.expires_at &&
                        new Date(invitation.expires_at) < new Date()
                        ? "text-red-500"
                        : "",
                    )}
                  >
                    {invitation.expires_at
                      ? new Date(invitation.expires_at).toLocaleDateString()
                      : "Never"}
                  </td>
                  <td className={"px-4 py-2"}>
                    {invitation.accepted_at
                      ? new Date(invitation.accepted_at).toLocaleDateString()
                      : ""}
                  </td>
                  <td className="flex justify-center gap-2 px-4 py-2">
                    <Button
                      size="icon"
                      onClick={() => handleResend(invitation.id)}
                      title="Resend"
                      disabled={Boolean(invitation.accepted_at)}
                    >
                      <RefreshCwIcon aria-label="Resend" size={16} />
                    </Button>
                    <Button
                      size="icon"
                      onClick={() => setInvitationToDelete(invitation.id)}
                      title="Delete"
                      disabled={Boolean(invitation.accepted_at)}
                    >
                      <TrashIcon aria-label="Delete" size={16} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        open={Boolean(invitationToDelete)}
        onOpenChange={() => setInvitationToDelete(undefined)}
        title={`Delete Invitation to ${data?.find((inv) => inv.id === invitationToDelete)?.email}`}
        onCancel={() => setInvitationToDelete(undefined)}
        onSubmit={() => invitationToDelete && handleDelete(invitationToDelete)}
      >
        This action cannot be undone. This will permanently delete the
        invitation.
      </Modal>
    </div>
  )
}

export const Route = createFileRoute("/_private/invitations/")({
  component: InvitationsList,
})
