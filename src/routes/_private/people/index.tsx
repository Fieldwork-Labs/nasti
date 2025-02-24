import { createFileRoute } from "@tanstack/react-router"

import { useCallback, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { ButtonLink } from "@/components/ui/buttonLink"
import { usePeople } from "@/hooks/usePeople"
import { Modal } from "@/components/ui/modal"

const PeopleList = () => {
  // TODO pagination
  // TODO search function

  const { orgId, isAdmin } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error } = usePeople()
  const [personToDelete, setPersonToDelete] = useState<string>()

  // Handle deletion of an trip
  const handleDelete = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("org_user").delete().eq("id", id)
      if (error) {
        toast({
          variant: "destructive",
          description: `Failed to remove user: ${error.message}`,
        })
      } else {
        toast({ description: "User removed successfully." })
        queryClient.invalidateQueries({ queryKey: ["users", orgId] })
        setPersonToDelete(undefined)
      }
    },
    [orgId, queryClient, toast],
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
                <th className="px-4 py-2 text-left">Member Since</th>
                {isAdmin && <th className="px-4 py-2">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((user) => (
                <tr key={user.id} className="border-t">
                  <td className="px-4 py-2">{user.name}</td>
                  <td className="px-4 py-2">{user.email}</td>
                  <td className="px-4 py-2">
                    {new Date(user.joined_at).toLocaleString()}
                  </td>
                  {isAdmin && (
                    <td className="flex justify-center gap-2 px-4 py-2">
                      <Button
                        size="icon"
                        onClick={() => setPersonToDelete(user.id)}
                        title="Delete"
                      >
                        <TrashIcon aria-label="Delete" size={16} />
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
          onSubmit={() => personToDelete && handleDelete(personToDelete)}
        >
          This action cannot be undone. This will permanently remove the user.
        </Modal>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_private/people/")({
  component: PeopleList,
})
