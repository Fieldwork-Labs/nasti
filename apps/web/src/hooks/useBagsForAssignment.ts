import { useQuery } from "@tanstack/react-query"
import { supabase } from "@nasti/common/supabase"

import {
  readPureLiveSeedStatistics,
  type PureLiveSeedStatistics,
} from "@/lib/pureLiveSeed"

export type BagForAssignment = {
  subBatchId: string
  batchId: string
  batchCode: string | null
  containerName: string | null
  currentWeightGrams: number
  /**
   * The ratios needed to work out pure live seed for any weight, or null when
   * the bag has never been tested. Deliberately not a finished count: the page
   * lets the user choose how much to send, so the figure has to be recomputed
   * as they type rather than scaled from a full-bag total.
   */
  pureLiveSeedStatistics: PureLiveSeedStatistics | null
  /** True once some other request has sent this bag while the basket sat open. */
  alreadyAssigned: boolean
}

/**
 * The bags in the basket, re-read from the server.
 *
 * A basket can sit open for a while, so nothing here trusts what was captured
 * when the bag was added: weights move as tests consume seed, and another Admin
 * may have sent the same bag in the meantime.
 *
 * Pure live seed is derived per bag rather than read from the test's stored
 * `plsCount`, which the database computes against the whole batch. A bag
 * inherits its parent batch's most recent quality test when it has none of its
 * own, because a bag split from a tested lot carries that lot's measured
 * characteristics.
 */
export const useBagsForAssignment = (subBatchIds: string[]) => {
  const key = [...subBatchIds].sort()

  return useQuery<BagForAssignment[]>({
    queryKey: ["bags-for-assignment", key],
    enabled: subBatchIds.length > 0,
    queryFn: async () => {
      const { data: bags, error: bagError } = await supabase
        .from("active_sub_batches")
        .select(
          `*,
           container:containers!sub_batches_container_id_fkey(id, name),
           batch:batch_id(id, code)`,
        )
        .in("id", key)

      if (bagError) throw new Error(bagError.message)
      if (!bags || bags.length === 0) return []

      const batchIds = [...new Set(bags.map((bag) => bag.batch_id as string))]

      // Quality tests for every parent batch, newest first, so the first match
      // for a bag — or failing that for its batch — is the one that counts.
      const { data: tests, error: testError } = await supabase
        .from("tests")
        .select("id, batch_id, sub_batch_id, statistics, tested_at")
        .in("batch_id", batchIds)
        .eq("type", "quality")
        .order("tested_at", { ascending: false })

      if (testError) throw new Error(testError.message)

      const { data: openAssignments, error: assignmentError } = await supabase
        .from("batch_testing_assignment")
        .select("sub_batch_id")
        .in("sub_batch_id", key)
        .is("closed_at", null)

      if (assignmentError) throw new Error(assignmentError.message)

      const assignedBagIds = new Set(
        (openAssignments ?? []).map((row) => row.sub_batch_id),
      )

      return bags.map((bag) => {
        const bagId = bag.id as string
        const batchId = bag.batch_id as string

        const test =
          (tests ?? []).find((t) => t.sub_batch_id === bagId) ??
          (tests ?? []).find((t) => t.batch_id === batchId)

        const currentWeightGrams = Number(bag.current_weight ?? 0)
        const container = bag.container as { name: string } | null
        const batch = bag.batch as { code: string | null } | null

        return {
          subBatchId: bagId,
          batchId,
          batchCode: batch?.code ?? null,
          containerName: container?.name ?? null,
          currentWeightGrams,
          pureLiveSeedStatistics: readPureLiveSeedStatistics(test?.statistics),
          alreadyAssigned: assignedBagIds.has(bagId),
        }
      })
    },
  })
}
