import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { createFileRoute } from "@tanstack/react-router"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { PlusIcon, RefreshCwIcon, TrashIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ButtonLink } from "@/components/ui/buttonLink"

const InvitationsList = () => {
  const { orgId, role } = useUserStore()
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

  // Handle deletion of an invitation
  const handleDelete = useCallback(
    async (id: string) => {
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
    },
    [orgId, queryClient, toast],
  )

  // Handle resending an invitation
  const handleResend = useCallback(
    async (id: string) => {
      const response = await fetch("/api/resend_invitation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ invitation_id: id }),
      })

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

  // Ensure the user is an admin
  if (role !== "Admin") {
    console.log("not admin", { role })
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">
          Access Denied: You do not have permission to view this page.
        </p>
      </div>
    )
  }

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
        <h2 className="text-2xl font-semibold mb-4">Invitations</h2>
        <ButtonLink to="/invitations/new" className="flex gap-1">
          <PlusIcon aria-label="New Invitation" size={16} /> <span>New</span>
        </ButtonLink>
      </div>
      {!data || data.length === 0 ? (
        <p>No invitations found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full rounded-lg overflow-hidden">
            <thead className="">
              <tr>
                <th className="py-2 px-4 text-left">Email</th>
                <th className="py-2 px-4 text-left">Created At</th>
                <th className="py-2 px-4 text-left">Expires At</th>
                <th className="py-2 px-4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((invitation) => (
                <tr key={invitation.id} className="border-t">
                  <td className="py-2 px-4">{invitation.email}</td>
                  <td className="py-2 px-4">
                    {new Date(invitation.created_at).toLocaleDateString()}
                  </td>
                  <td
                    className={cn(
                      "py-2 px-4",
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
                  <td className="py-2 px-4 flex gap-2">
                    <Button
                      size="icon"
                      onClick={() => handleResend(invitation.id)}
                      title="Resend"
                    >
                      <RefreshCwIcon aria-label="Resend" size={16} />
                    </Button>
                    <Button
                      size="icon"
                      onClick={() => handleDelete(invitation.id)}
                      title="Delete"
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
    </div>
  )
}

export const Route = createFileRoute("/_private/invitations/")({
  component: InvitationsList,
})
