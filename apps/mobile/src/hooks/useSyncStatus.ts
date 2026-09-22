import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { powerSyncDb } from "@/lib/powersync/db"

export type SyncStatusSummary = {
  queuedRows: number
  queuedMedia: number
  waitingForAuthentication: boolean
  activelyUploading: boolean
  permanentRowFailures: number
  permanentMediaFailures: number
  lastSafeError: string | null
  lastDisposition: string | null
}

export function useSyncStatus() {
  const { mode } = useAuth()
  const query = useQuery({
    queryKey: ["sync", "status-summary"],
    queryFn: async (): Promise<SyncStatusSummary> => {
      const [queue, local] = await Promise.all([
        powerSyncDb.getUploadQueueStats(),
        powerSyncDb.getAll(
          `SELECT
            (SELECT COUNT(*) FROM media_upload_jobs WHERE status IN ('pending', 'uploading', 'deleting')) AS queuedMedia,
            (SELECT COUNT(*) FROM media_upload_jobs WHERE status = 'uploading') AS activeMedia,
            (SELECT COUNT(*) FROM sync_failures) AS rowFailures,
            (SELECT COUNT(*) FROM media_upload_failures) AS mediaFailures,
            (SELECT error_info FROM sync_failures ORDER BY failed_at DESC LIMIT 1) AS rowError,
            (SELECT classification FROM sync_failures ORDER BY failed_at DESC LIMIT 1) AS rowDisposition,
            (SELECT safe_message FROM media_upload_failures ORDER BY failed_at DESC LIMIT 1) AS mediaError`,
          ) as Promise<Array<{ queuedMedia: number; activeMedia: number; rowFailures: number; mediaFailures: number; rowError: string | null; rowDisposition: string | null; mediaError: string | null }>>,
      ])
      const [counts] = local
      return {
        queuedRows: queue.count,
        queuedMedia: counts?.queuedMedia ?? 0,
        waitingForAuthentication: mode !== "live",
        activelyUploading: Boolean(powerSyncDb.currentStatus.dataFlowStatus.uploading) || (counts?.activeMedia ?? 0) > 0,
        permanentRowFailures: counts?.rowFailures ?? 0,
        permanentMediaFailures: counts?.mediaFailures ?? 0,
        lastSafeError: safeLastError(counts?.rowError, counts?.mediaError),
        lastDisposition: counts?.mediaError ? "permanent_media_failure" : counts?.rowDisposition ?? null,
      }
    },
    refetchInterval: 5_000,
    networkMode: "always",
    staleTime: 0,
  })

  return {
    ...query,
    status: query.data ?? {
      queuedRows: 0,
      queuedMedia: 0,
      waitingForAuthentication: mode !== "live",
      activelyUploading: Boolean(powerSyncDb.currentStatus.dataFlowStatus.uploading),
      permanentRowFailures: 0,
      permanentMediaFailures: 0,
      lastSafeError: null,
      lastDisposition: null,
    },
  }
}

function safeLastError(rowError: string | null | undefined, mediaError: string | null | undefined): string | null {
  if (mediaError) return mediaError.slice(0, 180)
  if (!rowError) return null
  try {
    const code = (JSON.parse(rowError) as { code?: unknown }).code
    return typeof code === "string" ? `Server rejected a change (${code})` : "A change needs attention"
  } catch {
    return "A change needs attention"
  }
}
