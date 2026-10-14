import { useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { parseOrgPermissions } from "@nasti/common/permissions"
import type { GetOrgUsers, OrgPermission } from "@nasti/common/types"
import useUserStore from "@/store/userStore"

type UpdatePermissionsArgs = {
  userId: string
  permissions: OrgPermission[]
}

// Admin-only. The RPC re-checks the caller's role server side, so a member
// who reaches this call gets a 42501 back rather than a silent no-op.
export const useUpdateUserPermissions = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, permissions }: UpdatePermissionsArgs) => {
      const { data, error } = await supabase.rpc("set_org_user_permissions", {
        p_user_id: userId,
        p_permissions: permissions,
      })
      if (error) throw new Error(error.message)
      return parseOrgPermissions(data)
    },
    onSuccess: (permissions, { userId }) => {
      queryClient.setQueryData<GetOrgUsers["Returns"]>(
        ["users", organisation?.id],
        (oldData) =>
          oldData?.map((user) =>
            user.id === userId ? { ...user, permissions } : user,
          ),
      )
    },
  })
}
