import { supabase } from "@nasti/common/supabase"
import useUserStore from "@/store/userStore"
import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

// =====================================================
// Types for the JSON the transfer RPCs return
// =====================================================

export interface IncomingTransferRequestBag {
  transfer_id: string
  weight_grams: number
  species_name: string | null
  collection_code: string | null
}

export interface IncomingTransferRequest {
  request_id: string
  requesting_org_name: string
  created_at: string
  bags: IncomingTransferRequestBag[]
}

export interface OutgoingTransferItem {
  sub_batch_id: string
  weight_grams: number
  species_name: string | null
  collection_code: string | null
}

export interface OutgoingTransfer {
  transfer_id: string
  recipient_org_name: string
  link_request_id: string | null
  created_at: string
  notes: string | null
  items: OutgoingTransferItem[]
}

export interface TransferLinkRequests {
  incoming_requests: IncomingTransferRequest[]
  incoming_request_count: number
  outgoing_transfers: OutgoingTransfer[]
  outgoing_links: { recipient_org_name: string; created_at: string }[]
  incoming_links: { sender_org_name: string; created_at: string }[]
}

export interface ProvenanceHop {
  hop: number
  sender_org_name: string
  transferred_at: string
}

export interface ProvenanceTest {
  type: string
  quality_test_type: string | null
  statistics: Record<string, number | null> | null
  result: Record<string, unknown> | null
  tested_at: string
  performed_by_org_name: string | null
  hop: number
}

export interface ReceivedBatchProvenance {
  batch_id: string
  species_name: string | null
  source_collection_code: string | null
  source_ibra_code: string | null
  source_ibra_name: string | null
  source_collection_year: number | null
  chain: ProvenanceHop[]
  tests: ProvenanceTest[]
}

export interface TransferBag {
  sub_batch_id: string
  // Omit to send the whole bag; present to split that weight off it first.
  sample_weight_grams?: number
}

export interface SendBagsForTransferResult {
  transfer: {
    id: string
    status: "pending_link" | "completed"
    sender_org_id: string
    sender_org_name: string
    recipient_org_id: string
    recipient_org_name: string
    link_request_id: string | null
    created_at: string
  }
  link_request_created: boolean
  replayed: boolean
}

export interface CancelOwnershipTransferResult {
  transfer_id: string
  status: string
  link_request_cancelled: boolean
  already_cancelled: boolean
}

export interface SetAcceptsTransfersResult {
  accepts_transfers: boolean
  changed: boolean
  cancelled_request_ids: string[]
  cancelled_transfer_ids: string[]
}

// =====================================================
// Query keys and invalidation
// =====================================================

export const transferKeys = {
  all: ["transfers"] as const,
  directory: () => ["transfers", "directory"] as const,
  linkRequests: (orgId?: string) =>
    ["transfers", "link-requests", orgId] as const,
  reservations: (orgId?: string) =>
    ["transfers", "reservations", orgId] as const,
  receivedSources: (orgId?: string) =>
    ["transfers", "received-sources", orgId] as const,
  batchEvents: (batchId?: string) =>
    ["transfers", "batch-events", batchId] as const,
  provenance: (batchId?: string) =>
    ["transfers", "provenance", batchId] as const,
  storageHistory: (batchId?: string) =>
    ["transfers", "storage-history", batchId] as const,
}

// A transfer moves seed between organisations, splits bags, reserves them and
// creates batches, so nothing can be narrowed to the bags in the request.
export const invalidateTransferQueries = (queryClient: QueryClient) => {
  for (const key of [
    transferKeys.all,
    ["batches"],
    ["subBatches"],
    ["batch-storage"],
    ["assignments"],
    ["containers"],
  ]) {
    queryClient.invalidateQueries({ queryKey: key })
  }
}

// Edge functions answer with `{ error }` on failure. supabase-js wraps a
// non-2xx response in FunctionsHttpError whose `context` is the Response.
const edgeErrorMessage = async (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context: unknown }).context
    if (context instanceof Response) {
      try {
        const body: unknown = await context.clone().json()
        // Our functions answer `{ error }`; the gateway and runtime answer
        // `{ msg }` or `{ message }` (e.g. a rejected JWT).
        if (body && typeof body === "object") {
          for (const key of ["error", "msg", "message"] as const) {
            const value: unknown = (body as Record<string, unknown>)[key]
            if (typeof value === "string" && value) return value
          }
        }
      } catch {
        // Not JSON; fall through.
      }
    }
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

// =====================================================
// Queries
// =====================================================

export const useTransferDirectory = () => {
  return useQuery({
    queryKey: transferKeys.directory(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_transfer_directory")
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export const useTransferLinkRequests = () => {
  const { organisation, isAdmin } = useUserStore()

  return useQuery({
    queryKey: transferKeys.linkRequests(organisation?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "fn_list_transfer_link_requests",
      )
      if (error) throw new Error(error.message)
      return data as unknown as TransferLinkRequests
    },
    enabled: Boolean(organisation?.id) && Boolean(isAdmin),
  })
}

// The pending outgoing transfers come from the same RPC as the requests.
export const useOwnershipTransfers = () => {
  const query = useTransferLinkRequests()
  return { ...query, data: query.data?.outgoing_transfers }
}

/** Map of sub_batch_id → reservation, for every bag the caller has reserved. */
export const useSubBatchReservations = () => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: transferKeys.reservations(organisation?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_sub_batch_reservations")
      if (error) throw new Error(error.message)
      return new Map(data.map((row) => [row.sub_batch_id, row]))
    },
    enabled: Boolean(organisation?.id),
  })
}

/** Map of batch_id → sender, for every batch the caller received. */
export const useReceivedBatchSources = () => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: transferKeys.receivedSources(organisation?.id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("fn_received_batch_sources")
      if (error) throw new Error(error.message)
      return new Map(data.map((row) => [row.batch_id, row]))
    },
    enabled: Boolean(organisation?.id),
  })
}

/**
 * Ids of the caller's batches that are received seed: either received directly
 * (`received_transfer_item_id`) or cleaned from a received batch, which carries
 * `source_collection_code` forward. `active_batches` does not expose those
 * columns, so this reads them from `batches`. Mixed and combined batches are
 * also collectionless but have neither column set, so they are not included.
 * Keyed under "batches" so every batch invalidation (cleaning, transfers)
 * refreshes it.
 */
export const useReceivedSeedBatchIds = () => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: ["batches", "receivedSeedIds", organisation?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batches")
        .select("id")
        .eq("organisation_id", organisation?.id ?? "")
        .or(
          "received_transfer_item_id.not.is.null,source_collection_code.not.is.null",
        )
      if (error) throw new Error(error.message)
      return new Set(data.map((row) => row.id))
    },
    enabled: Boolean(organisation?.id),
  })
}

export interface BatchTransferEvent {
  id: string
  weight_grams: number
  effective_at: string
  recipient_org_id: string
}

/**
 * Ownership transfers that took seed out of a batch the caller sent from, for
 * the sender's batch history. The recipient's organisation row isn't readable
 * by the sender, so the name is looked up separately (see the history view).
 */
export const useBatchTransferEvents = (batchId?: string) => {
  const { organisation } = useUserStore()

  return useQuery({
    queryKey: transferKeys.batchEvents(batchId),
    queryFn: async () => {
      if (!batchId || !organisation?.id) return []
      const { data, error } = await supabase
        .from("seed_transfer_item")
        .select(
          `
          id,
          weight_grams,
          event:seed_transfer_event!inner(
            kind,
            effective_at,
            sender_org_id,
            recipient_org_id
          )
        `,
        )
        .eq("batch_id", batchId)
        .eq("event.kind", "ownership_transfer")
        .eq("event.sender_org_id", organisation.id)
        .overrideTypes<
          Array<{
            id: string
            weight_grams: number
            event: { effective_at: string; recipient_org_id: string }
          }>,
          { merge: false }
        >()
      if (error) throw new Error(error.message)

      return data
        .map(
          (item): BatchTransferEvent => ({
            id: item.id,
            weight_grams: item.weight_grams,
            effective_at: item.event.effective_at,
            recipient_org_id: item.event.recipient_org_id,
          }),
        )
        .sort((a, b) => a.effective_at.localeCompare(b.effective_at))
    },
    enabled: Boolean(batchId) && Boolean(organisation?.id),
  })
}

export const useReceivedBatchProvenance = (
  batchId?: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: transferKeys.provenance(batchId),
    queryFn: async () => {
      if (!batchId) throw new Error("No batch")
      const { data, error } = await supabase.rpc(
        "fn_received_batch_provenance",
        { p_batch_id: batchId },
      )
      if (error) throw new Error(error.message)
      return data as unknown as ReceivedBatchProvenance
    },
    enabled: Boolean(batchId) && enabled,
  })
}

export const useReceivedBatchStorageHistory = (
  batchId?: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: transferKeys.storageHistory(batchId),
    queryFn: async () => {
      if (!batchId) throw new Error("No batch")
      const { data, error } = await supabase.rpc(
        "fn_received_batch_storage_history",
        { p_batch_id: batchId },
      )
      if (error) throw new Error(error.message)
      return data
    },
    enabled: Boolean(batchId) && enabled,
  })
}

// =====================================================
// Mutations
// =====================================================

/**
 * Sends bags to another organisation. `request_id` makes the call idempotent:
 * generate one per confirmed intent and reuse it when retrying.
 */
export const useSendBagsForTransfer = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: {
      recipient_org_id: string
      bags: TransferBag[]
      notes?: string | null
      request_id: string
    }) => {
      const { data, error } = await supabase.functions.invoke(
        "send_bags_for_transfer",
        { body },
      )
      if (error) {
        throw new Error(
          await edgeErrorMessage(error, "Failed to transfer bags"),
        )
      }
      return data as SendBagsForTransferResult
    },
    onSuccess: () => invalidateTransferQueries(queryClient),
  })
}

export const useRespondTransferLinkRequest = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: { request_id: string; accept: boolean }) => {
      const { data, error } = await supabase.functions.invoke(
        "respond_transfer_link_request",
        { body },
      )
      if (error) {
        throw new Error(
          await edgeErrorMessage(error, "Failed to respond to the request"),
        )
      }
      return data as unknown
    },
    onSuccess: () => invalidateTransferQueries(queryClient),
  })
}

export const useCancelOwnershipTransfer = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (transferId: string) => {
      const { data, error } = await supabase.rpc(
        "fn_cancel_ownership_transfer",
        { p_transfer_id: transferId },
      )
      if (error) throw new Error(error.message)
      return data as unknown as CancelOwnershipTransferResult
    },
    onSuccess: () => invalidateTransferQueries(queryClient),
  })
}

export const useSetAcceptsTransfers = () => {
  const queryClient = useQueryClient()
  const { organisation, setOrg } = useUserStore()

  return useMutation({
    mutationFn: async (accepts: boolean) => {
      const { data, error } = await supabase.rpc("fn_set_accepts_transfers", {
        p_accepts: accepts,
      })
      if (error) throw new Error(error.message)
      return data as unknown as SetAcceptsTransfersResult
    },
    onSuccess: (result) => {
      if (organisation) {
        setOrg({ ...organisation, accepts_transfers: result.accepts_transfers })
      }
      invalidateTransferQueries(queryClient)
    },
  })
}
