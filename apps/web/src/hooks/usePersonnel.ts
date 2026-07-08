import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { Personnel } from "@nasti/common/types"
import type { TablesInsert, TablesUpdate } from "@nasti/common/types/database"
import useUserStore from "@/store/userStore"

export type PersonnelFormValues = Pick<
  TablesInsert<"personnel">,
  "name" | "email" | "job_role" | "is_active"
>

export const usePersonnel = () => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: ["personnel", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("Organisation not found")

      const { data, error } = await supabase
        .from("personnel")
        .select("*")
        .eq("organisation_id", organisation.id)
        .order("name")

      if (error) throw new Error(error.message)
      return data
    },
    enabled: Boolean(organisation?.id),
  })
}

export const useUpsertPersonnel = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      values: PersonnelFormValues & Pick<TablesUpdate<"personnel">, "id">,
    ) => {
      if (!organisation?.id) throw new Error("Organisation not found")

      const { data, error } = await supabase
        .from("personnel")
        .upsert({
          ...values,
          email: values.email?.trim() || null,
          job_role: values.job_role?.trim() || null,
          organisation_id: organisation.id,
        })
        .select("*")
        .single()

      if (error) throw new Error(error.message)
      return data as Personnel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["personnel", organisation?.id],
      })
      queryClient.invalidateQueries({ queryKey: ["persons", organisation?.id] })
    },
  })
}

export const useSetPersonnelActive = () => {
  const { organisation } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      is_active,
    }: Pick<Personnel, "id" | "is_active">) => {
      const { data, error } = await supabase
        .from("personnel")
        .update({ is_active })
        .eq("id", id)
        .select("*")
        .single()

      if (error) throw new Error(error.message)
      return data as Personnel
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["personnel", organisation?.id],
      })
      queryClient.invalidateQueries({ queryKey: ["persons", organisation?.id] })
    },
  })
}
