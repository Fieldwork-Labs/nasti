import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { Treatment } from "@nasti/common/types"

type TreatmentWithDetails = Treatment & {
  input_batch?: {
    id: string
    code: string
  } | null
  output_batch: {
    id: string
    code: string
  }
}

export type { TreatmentWithDetails }

export const useTreatmentHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["treatments", "history", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select(
          `
          *,
          input_batch:batches!treatments_input_batch_id_fkey(id, code),
          output_batch:batches!treatments_output_batch_id_fkey(id, code)
        `,
        )
        .or(`input_batch_id.eq.${batchId},output_batch_id.eq.${batchId}`)
        .order("created_at", { ascending: false })
        .overrideTypes<TreatmentWithDetails[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export const useTreatmentEvent = (treatmentId: string) => {
  return useQuery({
    queryKey: ["treatments", "detail", treatmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select(
          `
          *,
          input_batch:batches!treatments_input_batch_id_fkey(id, code),
          output_batch:batches!treatments_output_batch_id_fkey(id, code)
        `,
        )
        .eq("id", treatmentId)
        .single()
        .overrideTypes<TreatmentWithDetails>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

export const useCollectionTreatmentHistory = (collectionId: string) => {
  return useQuery({
    queryKey: ["treatments", "collection", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select(
          `
          *,
          input_batch:batches!treatments_input_batch_id_fkey(id, code, collection_id),
          output_batch:batches!treatments_output_batch_id_fkey(id, code)
        `,
        )
        .eq("input_batch.collection_id", collectionId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as TreatmentWithDetails[]
    },
  })
}
