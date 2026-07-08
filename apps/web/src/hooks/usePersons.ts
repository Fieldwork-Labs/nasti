import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"

export const usePersons = () => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: ["persons", organisation?.id],
    queryFn: async () => {
      if (!organisation?.id) throw new Error("Organisation not found")

      const { data, error } = await supabase
        .from("person")
        .select("*")
        .eq("organisation_id", organisation.id)
        .order("display_name")

      if (error) throw new Error(error.message)
      return data
    },
    enabled: Boolean(organisation?.id),
  })
}
