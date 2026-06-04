import { supabase } from "@nasti/common/supabase"
import { useQuery } from "@tanstack/react-query"

export const useOrgMembers = () =>
  useQuery({
    queryKey: ["people", "list"],
    queryFn: async () => await supabase.rpc("get_organisation_users"),
  })
