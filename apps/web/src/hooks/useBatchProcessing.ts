import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import type { BatchProcessing } from "@nasti/common/types"

type BatchProcessingWithDetails = BatchProcessing & {
  input_batch?: {
    id: string
    code: string
  } | null
  output_batch: {
    id: string
    code: string
  }
}

// Query: Get processing history for a batch
export const useBatchProcessingHistory = (batchId: string) => {
  return useQuery({
    queryKey: ["batchProcessing", "history", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_processing")
        .select(
          `
          *,
          input_batch:batches!batch_processing_input_batch_id_fkey(id, code),
          output_batch:batches!batch_processing_output_batch_id_fkey(id, code)
        `,
        )
        .or(`input_batch_id.eq.${batchId},output_batch_id.eq.${batchId}`)
        .order("created_at", { ascending: false })
        .overrideTypes<BatchProcessingWithDetails[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}
// Query: Get processing event
export const useBatchProcessingEvent = (processingId: string) => {
  return useQuery({
    queryKey: ["batchProcessing", "detail", processingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_processing")
        .select(
          `
          *,
          input_batch:batches!batch_processing_input_batch_id_fkey(id, code),
          output_batch:batches!batch_processing_output_batch_id_fkey(id, code)
        `,
        )
        .eq("id", processingId)
        .single()
        .overrideTypes<BatchProcessingWithDetails>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Query: Get all processing records for a collection
export const useCollectionProcessingHistory = (collectionId: string) => {
  return useQuery({
    queryKey: ["batchProcessing", "collection", collectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_processing")
        .select(
          `
          *,
          input_batch:batches!batch_processing_input_batch_id_fkey(id, code, collection_id),
          output_batch:batches!batch_processing_output_batch_id_fkey(id, code),
          created_by_user:users!batch_processing_created_by_fkey(email)
        `,
        )
        .eq("input_batch.collection_id", collectionId)
        .order("created_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as BatchProcessingWithDetails[]
    },
  })
}
