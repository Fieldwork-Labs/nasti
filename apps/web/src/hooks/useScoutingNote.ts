import { QueryKey, useQuery } from "@tanstack/react-query"

import { supabase } from "@nasti/common/supabase"
import { ScoutingNote } from "@nasti/common/types"

import { queryClient } from "@nasti/common/utils"

type QueryTuple = [QueryKey, ScoutingNote[] | ScoutingNote | undefined]

const findItemById = (
  queryDataArray: QueryTuple[],
  targetId: string,
): ScoutingNote | undefined => {
  // Iterate through each tuple in the array
  for (const [_, sns] of queryDataArray) {
    if (!sns) continue
    if (!Array.isArray(sns)) {
      if (sns.id === targetId) return sns
    } else {
      const foundItem = sns.find((item) => item.id === targetId)
      if (foundItem) return foundItem
    }
  }
  return undefined
}

export const getScoutingNote = async (id: string) => {
  // first attempt to get it from the global cache
  const cached = queryClient.getQueriesData<ScoutingNote[]>({
    queryKey: ["scoutingNotes"],
  })
  if (cached) {
    const sn = findItemById(cached, id)
    if (sn) return sn
  }

  const { data, error } = await supabase
    .from("scouting_notes")
    .select("*")
    .eq("id", id)
    .single()

  if (error) throw new Error(error.message)

  return data as ScoutingNote
}

export const useScoutingNote = (id: string) => {
  return useQuery({
    queryKey: ["scoutingNotes", "detail", id],
    queryFn: () => getScoutingNote(id),
  })
}
