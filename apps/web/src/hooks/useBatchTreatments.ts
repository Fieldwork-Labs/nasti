import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type { Treatment, Test } from "@nasti/common/types"
import useUserStore from "@/store/userStore"
import { Json } from "@nasti/common/types/database"

// Query: Get treatments for a batch
export const useBatchTreatments = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "treatments", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select(`*`)
        .eq("batch_id", batchId)
        .order("performed_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as Treatment[]
    },
  })
}

// Mutation: Add treatment to batch
type AddTreatmentParams = {
  batchId: string
  type: string
  description?: string
  performedAt?: string
}

export const useAddTreatment = () => {
  return useMutation<Treatment, Error, AddTreatmentParams>({
    mutationFn: async ({ batchId, type, description, performedAt }) => {
      const { data, error } = await supabase
        .from("treatments")
        .insert({
          batch_id: batchId,
          type,
          description,
          performed_at: performedAt || new Date().toISOString(),
          performed_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Treatment
    },
    onSuccess: (newTreatment) => {
      // Add to batch treatments cache
      queryClient.setQueryData<Treatment[]>(
        ["batches", "treatments", newTreatment.batch_id],
        (oldData) => {
          if (!oldData) return [newTreatment]
          return [newTreatment, ...oldData]
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", newTreatment.batch_id],
      })
    },
  })
}

// Mutation: Update treatment
type UpdateTreatmentParams = {
  id: string
  type?: string
  description?: string
  performedAt?: string
}

export const useUpdateTreatment = () => {
  return useMutation<Treatment, Error, UpdateTreatmentParams>({
    mutationFn: async ({ id, type, description, performedAt }) => {
      const { data, error } = await supabase
        .from("treatments")
        .update({
          type,
          description,
          performed_at: performedAt,
        })
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Treatment
    },
    onSuccess: (updatedTreatment) => {
      // Update in treatments cache
      queryClient.setQueryData<Treatment[]>(
        ["batches", "treatments", updatedTreatment.batch_id],
        (oldData) => {
          if (!oldData) return [updatedTreatment]
          return oldData.map((treatment) =>
            treatment.id === updatedTreatment.id ? updatedTreatment : treatment,
          )
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", updatedTreatment.batch_id],
      })
    },
  })
}

// Mutation: Delete treatment
export const useDeleteTreatment = () => {
  return useMutation<Treatment, Error, string>({
    mutationFn: async (treatmentId) => {
      const { data, error } = await supabase
        .from("treatments")
        .delete()
        .eq("id", treatmentId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Treatment
    },
    onSuccess: (deletedTreatment) => {
      // Remove from treatments cache
      queryClient.setQueryData<Treatment[]>(
        ["batches", "treatments", deletedTreatment.batch_id],
        (oldData) => {
          if (!oldData) return []
          return oldData.filter(
            (treatment) => treatment.id !== deletedTreatment.id,
          )
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", deletedTreatment.batch_id],
      })
    },
  })
}

// Query: Get tests for a batch
export const useBatchTests = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "tests", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("batch_id", batchId)
        .order("tested_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as Test[]
    },
  })
}

// Mutation: Add test to batch
type AddTestParams = {
  batchId: string
  type: "viability" | "germination"
  result?: Json
  testedAt?: string
}

export const useAddTest = () => {
  const { user } = useUserStore()

  return useMutation<Test, Error, AddTestParams>({
    mutationFn: async ({ batchId, type, result, testedAt }) => {
      const { data, error } = await supabase
        .from("tests")
        .insert({
          batch_id: batchId,
          type,
          result: result,
          tested_at: testedAt || new Date().toISOString(),
          tested_by: user?.id,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Test
    },
    onSuccess: (newTest) => {
      // Add to batch tests cache
      queryClient.setQueryData<Test[]>(
        ["batches", "tests", newTest.batch_id],
        (oldData) => {
          if (!oldData) return [newTest]
          return [newTest, ...oldData]
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", newTest.batch_id],
      })
    },
  })
}

// Mutation: Update test
type UpdateTestParams = {
  id: string
  type?: "viability" | "germination"
  result?: Json
  testedAt?: string
}

export const useUpdateTest = () => {
  return useMutation<Test, Error, UpdateTestParams>({
    mutationFn: async ({ id, type, result, testedAt }) => {
      const { data, error } = await supabase
        .from("tests")
        .update({
          type,
          result,
          tested_at: testedAt,
        })
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Test
    },
    onSuccess: (updatedTest) => {
      // Update in tests cache
      queryClient.setQueryData<Test[]>(
        ["batches", "tests", updatedTest.batch_id],
        (oldData) => {
          if (!oldData) return [updatedTest]
          return oldData.map((test) =>
            test.id === updatedTest.id ? updatedTest : test,
          )
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", updatedTest.batch_id],
      })
    },
  })
}

// Mutation: Delete test
export const useDeleteTest = () => {
  return useMutation<Test, Error, string>({
    mutationFn: async (testId) => {
      const { data, error } = await supabase
        .from("tests")
        .delete()
        .eq("id", testId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as Test
    },
    onSuccess: (deletedTest) => {
      // Remove from tests cache
      queryClient.setQueryData<Test[]>(
        ["batches", "tests", deletedTest.batch_id],
        (oldData) => {
          if (!oldData) return []
          return oldData.filter((test) => test.id !== deletedTest.id)
        },
      )

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", deletedTest.batch_id],
      })
    },
  })
}
