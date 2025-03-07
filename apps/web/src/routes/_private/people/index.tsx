import { createFileRoute } from "@tanstack/react-router"

import { useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { useToast } from "@nasti/ui/hooks/use-toast"
import { Button } from "@nasti/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { ButtonLink } from "@nasti/ui/button-link"
import { usePeople } from "@/hooks/usePeople"
import { Modal } from "@nasti/ui/modal"
import { Spinner } from "@nasti/ui/spinner"
import { cn } from "@nasti/utils"
import { GetOrgUsers } from "@/types"

const PeopleList = () => {
  // TODO pagination
  // TODO search function

  const { orgId, isAdmin, session, user: currentUser } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error } = usePeople()
  const [personToDelete, setPersonToDelete] = useState<string>()
  const [isDeleting, setIsDeleting] = useState<string>()

  // Handle disabling a user
  const handleDisable = useCallback(
    async (id: string) => {
      setIsDeleting(id)
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/disable_user`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ userId: id }),
        },
      )
      setIsDeleting(undefined)
      setPersonToDelete(undefined)

      if (!response.ok) {
        const message = await response.text()
        toast({
          variant: "destructive",
          description: `Failed to disable user: ${message}`,
        })
      } else {
        toast({ description: "User disabled successfully." })
        queryClient.setQueryData<GetOrgUsers["Returns"]>(
          ["users", orgId],
          (oldData) => {
            if (!oldData || oldData.length === 0) return []
            return oldData.map((item) =>
              item.id === id ? { ...item, is_active: false } : item,
            )
          },
        )
      }
    },
    [orgId, queryClient, session?.access_token, toast],
  )

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <p>Loading people...</p>
      </div>
    )
  }

  if (isError && error) {
    return (
      <div className="p-4 text-center">
        <p className="text-red-500">Error: {error.message}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">People</h2>
        {isAdmin && (
          <span className="flex gap-2">
            <ButtonLink to="/invitations">See invitations</ButtonLink>
            <ButtonLink to="/invitations/new" className="flex gap-1">
              <PlusIcon aria-label="New Trip" size={16} />{" "}
              <span>Invite new</span>
            </ButtonLink>
          </span>
        )}
      </div>
      {!data || data.length === 0 ? (
        <p>No people found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full overflow-hidden rounded-lg">
            <thead className="">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Email</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Member Since</th>
                {isAdmin && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((user) => (
                <tr
                  key={user.id}
                  className={cn(
                    "h-14 border-t",
                    !user.is_active && "text-muted-foreground",
                  )}
                >
                  <td className="px-4 py-2">{user.name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">{user.role}</td>
                  <td className="px-4 py-2">
                    {new Date(user.joined_at).toLocaleString()}
                  </td>
                  {isAdmin && user.is_active && (
                    <td className="flex justify-center gap-2 px-4 py-2">
                      <Button
                        size="icon"
                        onClick={() => setPersonToDelete(user.id)}
                        title="Delete"
                        disabled={
                          isDeleting === user.id || user.id === currentUser?.id
                        }
                      >
                        {isDeleting !== user.id && (
                          <TrashIcon aria-label="Delete" size={16} />
                        )}
                        {isDeleting === user.id && <Spinner />}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {personToDelete && (
        <Modal
          open={Boolean(personToDelete)}
          onOpenChange={() => setPersonToDelete(undefined)}
          title={`Remove ${data?.find((person) => person.id === personToDelete)?.name}`}
          onCancel={() => setPersonToDelete(undefined)}
          onSubmit={() => personToDelete && handleDisable(personToDelete)}
          allowSubmit={!isDeleting}
          isPending={Boolean(isDeleting)}
        >
          This action cannot be undone. This will permanently disable the user.
        </Modal>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_private/people/")({
  component: PeopleList,
})
