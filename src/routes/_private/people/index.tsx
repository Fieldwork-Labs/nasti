import { createFileRoute } from "@tanstack/react-router"

import { useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { useQueryClient } from "@tanstack/react-query"
import useUserStore from "@/store/userStore"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { PlusIcon, TrashIcon } from "lucide-react"
import { ButtonLink } from "@/components/ui/buttonLink"
import { usePeople } from "@/hooks/usePeople"

const PeopleList = () => {
  // TODO pagination
  // TODO search function

  const { orgId, isAdmin } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data, isLoading, isError, error } = usePeople()

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
        <h2 className="mb-4 text-2xl font-semibold">Trips</h2>
        {isAdmin && (
          <ButtonLink to="/invitations/new" className="flex gap-1">
            <PlusIcon aria-label="New Trip" size={16} /> <span>Invite new</span>
          </ButtonLink>
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
                        onClick={() => handleDelete(user.id)}
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
    </div>
  )
}

export const Route = createFileRoute("/_private/people/")({
  component: PeopleList,
})
