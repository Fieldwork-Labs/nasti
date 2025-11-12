import { useMutation, useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"
import { queryClient } from "@nasti/common/utils"
import type {
  Treatment,
  Test,
  QualityTest,
  QualityTestResult,
  ActiveBatch,
} from "@nasti/common/types"
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

///////

function getStandardDeviation(viability: number[]) {
  if (viability.length < 2) return undefined

  let sum = 0
  let sumSquares = 0

  for (let i = 0; i < viability.length; i++) {
    sum += viability[i]
    sumSquares += viability[i] ** 2
  }

  const n = viability.length
  const mean = sum / n
  const variance = (sumSquares - n * mean ** 2) / (n - 1)

  return Math.sqrt(variance)
}

function getStandardError(repeats: QualityTest["result"]["repeats"]) {
  const viableFractionArray = repeats.map(
    ({ viable_seed_count, dead_seed_count }) =>
      viable_seed_count / (viable_seed_count + dead_seed_count),
  )
  const sd = getStandardDeviation(viableFractionArray)
  if (!sd) return undefined
  return sd / Math.sqrt(repeats.length)
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)

export function getStatisticsForBatch(
  { result }: QualityTest,
  batchWeight: number,
) {
  const { viability, perSeedWeights } = result.repeats.reduce<{
    viability: number[]
    perSeedWeights: number[]
  }>(
    (acc, { viable_seed_count, dead_seed_count, weight_grams }) => {
      const totalCount = viable_seed_count + dead_seed_count
      if (totalCount === 0) {
        acc.viability.push(0)
        acc.perSeedWeights.push(0)
      } else {
        acc.viability.push(viable_seed_count / totalCount)
        acc.perSeedWeights.push(weight_grams / totalCount)
      }
      return acc
    },
    {
      viability: [],
      perSeedWeights: [],
    },
  )
  const repeatCount = result.repeats.length

  const pureSeedFraction =
    result.psu_grams / result.psu_grams +
    (result.inert_seed_weight_grams ?? 0) +
    (result.other_species_seeds_grams ?? 0)
  const meanViability = sum(viability) / repeatCount
  const meanSeedWeight = sum(perSeedWeights) / repeatCount
  const pureLiveSeedFraction = pureSeedFraction * meanViability

  const batchSeedCount = batchWeight / meanSeedWeight
  const batchPureSeedCount = Math.round(batchSeedCount * pureSeedFraction)
  const batchPureLiveSeedCount = Math.round(
    batchSeedCount * pureLiveSeedFraction,
  )
  const standardError = getStandardError(result.repeats)

  return {
    tpsu: meanSeedWeight.toFixed(3),
    psu: pureSeedFraction.toFixed(3),
    vsu: meanViability.toFixed(3),
    pls: pureLiveSeedFraction.toFixed(3),
    plsCount: batchPureLiveSeedCount,
    psuCount: batchPureSeedCount,
    standardError,
  }
}

// Query: Get tests for a batch
export const useBatchTests = (batchId?: string) => {
  return useQuery({
    queryKey: ["batches", "tests", batchId],
    queryFn: async () => {
      if (!batchId) return []
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("batch_id", batchId)
        .order("tested_at", { ascending: false })
        .overrideTypes<QualityTest[]>()

      if (error) throw new Error(error.message)
      return data
    },
  })
}

// Mutation: Add test to batch
type AddTestParams = {
  batchId: string
  type: "quality" | "germination"
  result?: Json
  testedAt?: string
}

export const useAddTest = () => {
  const { user, organisation } = useUserStore()

  return useMutation<Test, Error, AddTestParams>({
    mutationFn: async ({ batchId, type, result, testedAt }) => {
      if (!organisation?.id) {
        throw new Error("Organisation ID is required")
      }

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

// ============================================================================
// QUALITY TEST SPECIFIC HOOKS
// ============================================================================

// Query: Get quality tests for a batch
export const useQualityTests = (batchId: string) => {
  return useQuery({
    queryKey: ["batches", "qualityTests", batchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("batch_id", batchId)
        .eq("type", "quality")
        .order("tested_at", { ascending: false })

      if (error) throw new Error(error.message)
      return data as unknown as QualityTest[]
    },
  })
}

// Query: Get single quality test by ID
export const useQualityTest = (testId: string) => {
  return useQuery({
    queryKey: ["tests", "quality", testId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("id", testId)
        .eq("type", "quality")
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as QualityTest
    },
  })
}

// Mutation: Create quality test
type CreateQualityTestParams = {
  batchId: string
  result: QualityTestResult
}

export const useCreateQualityTest = () => {
  const { user, organisation } = useUserStore()

  return useMutation<QualityTest, Error, CreateQualityTestParams>({
    mutationFn: async ({ batchId, result }) => {
      if (!organisation?.id) {
        throw new Error("Organisation ID is required")
      }

      const { data, error } = await supabase
        .from("tests")
        .insert({
          batch_id: batchId,
          type: "quality",
          result: result as unknown as Json,
          tested_at: new Date().toISOString(),
          tested_by: user?.id,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as QualityTest
    },
    onSuccess: (newTest) => {
      // Invalidate quality tests cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "qualityTests", newTest.batch_id],
      })

      // Invalidate all tests cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "tests", newTest.batch_id],
      })

      // Invalidate batch detail cache
      queryClient.invalidateQueries({
        queryKey: ["batches", "detail", newTest.batch_id],
      })

      // find the batch in the filter queries
      const batchFilterQueries = queryClient.getQueriesData<ActiveBatch[]>({
        queryKey: ["batches", "byFilter"],
        predicate: (query) =>
          query.state.data?.find((batch) => batch.id === newTest.batch_id) !==
          undefined,
      })

      if (batchFilterQueries) {
        batchFilterQueries.forEach(([queryKey]) => {
          queryClient.setQueryData<ActiveBatch[]>(queryKey, (oldData) => {
            if (oldData) {
              return oldData.map((batch) => {
                if (batch.id === newTest.batch_id)
                  return {
                    ...batch,
                    latest_quality_statistics:
                      newTest.statistics as ActiveBatch["latest_quality_statistics"],
                  }
                return batch
              })
            }
            return oldData
          })
        })
      }
    },
  })
}

// Mutation: Update quality test
type UpdateQualityTestParams = {
  id: string
  result: QualityTestResult
}

export const useUpdateQualityTest = () => {
  return useMutation<QualityTest, Error, UpdateQualityTestParams>({
    mutationFn: async ({ id, result }) => {
      const { data, error } = await supabase
        .from("tests")
        .update({
          result: result as unknown as Json,
          tested_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as QualityTest
    },
    onSuccess: async (updatedTest) => {
      // wait one second to ensure the trigger function re-calculates the statistics
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const { data, error } = await supabase
        .from("tests")
        .select("*")
        .eq("id", updatedTest.id)
        .limit(1)
        .maybeSingle()
        .overrideTypes<QualityTest>()

      if (error) throw new Error(error.message)
      if (!data) throw new Error("Test not found")

      // Update in quality tests cache
      queryClient.setQueryData<QualityTest[]>(
        ["batches", "qualityTests", data.batch_id],
        (oldData) => {
          if (!oldData) return [data]
          return oldData.map((test) =>
            test.id === updatedTest.id ? data : test,
          )
        },
      )

      // Update in all tests cache
      queryClient.setQueryData<QualityTest[]>(
        ["batches", "tests", updatedTest.batch_id],
        (oldData) => {
          if (!oldData) return [data]
          return oldData.map((test) =>
            test.id === updatedTest.id ? data : test,
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

// Mutation: Delete quality test
export const useDeleteQualityTest = () => {
  return useMutation<QualityTest, Error, string>({
    mutationFn: async (testId) => {
      const { data, error } = await supabase
        .from("tests")
        .delete()
        .eq("id", testId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as QualityTest
    },
    onSuccess: (deletedTest) => {
      // Remove from quality tests cache
      queryClient.setQueryData<QualityTest[]>(
        ["batches", "qualityTests", deletedTest.batch_id],
        (oldData) => {
          if (!oldData) return []
          return oldData.filter((test) => test.id !== deletedTest.id)
        },
      )

      // Remove from all tests cache
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
