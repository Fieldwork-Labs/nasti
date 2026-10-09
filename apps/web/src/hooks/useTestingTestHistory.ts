import { supabase } from "@nasti/common/supabase"
import type { QualityTest } from "@nasti/common/types"
import { useQuery } from "@tanstack/react-query"
import { useMemo } from "react"

import useUserStore from "@/store/userStore"

/**
 * A test the Testing organisation performed, with enough context to identify
 * it. The batch is often unreadable by then (the bag has been returned), so
 * fn_testing_test_history supplies the context itself.
 */
export type TestingTestHistoryRow = {
  test: QualityTest
  batchCode: string | null
  speciesName: string | null
  collectionCode: string | null
  ownerName: string | null
}

export const TESTING_TEST_HISTORY_KEY = ["tests", "testingHistory"] as const

// Query: every quality test the user's organisation has performed, newest first
export const useTestingTestHistory = () => {
  const { organisation } = useUserStore()

  return useQuery<TestingTestHistoryRow[]>({
    queryKey: [...TESTING_TEST_HISTORY_KEY, organisation?.id],
    enabled: Boolean(organisation?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_testing_test_history")

      if (error) throw new Error(error.message)

      return data.map((row) => ({
        test: {
          id: row.test_id,
          batch_id: row.batch_id,
          sub_batch_id: row.sub_batch_id,
          type: "quality",
          result: row.result,
          statistics: row.statistics,
          tested_at: row.tested_at,
          tested_by: row.tested_by,
          performed_by_organisation_id: row.performed_by_organisation_id,
        } as unknown as QualityTest,
        batchCode: row.batch_code,
        speciesName: row.species_name,
        collectionCode: row.collection_code,
        ownerName: row.owner_org_name,
      }))
    },
  })
}

// Query: which tests each held bag carries, by bag id. A bag the laboratory
// split or merged carries the tests of the bags it came from.
const useHeldBagTestIds = () => {
  const { organisation } = useUserStore()

  return useQuery<Map<string, string[]>>({
    queryKey: [...TESTING_TEST_HISTORY_KEY, "byBag", organisation?.id],
    enabled: Boolean(organisation?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_testing_held_bag_tests")

      if (error) throw new Error(error.message)

      const testIdsByBag = new Map<string, string[]>()
      for (const row of data) {
        testIdsByBag.set(row.sub_batch_id, [
          ...(testIdsByBag.get(row.sub_batch_id) ?? []),
          row.test_id,
        ])
      }
      return testIdsByBag
    },
  })
}

/**
 * The tests a held bag carries, newest first. Every row of the inventory reads
 * this, but they all share the two underlying queries.
 */
export const useBagTestResults = (subBatchId: string) => {
  const history = useTestingTestHistory()
  const testIdsByBag = useHeldBagTestIds()

  const results = useMemo(() => {
    const testIds = new Set(testIdsByBag.data?.get(subBatchId))
    return (history.data ?? []).filter((row) => testIds.has(row.test.id))
  }, [history.data, testIdsByBag.data, subBatchId])

  return {
    data: results,
    isLoading: history.isLoading || testIdsByBag.isLoading,
    error: history.error ?? testIdsByBag.error,
  }
}
