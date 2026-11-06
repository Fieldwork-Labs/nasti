import { useQuery } from "@tanstack/react-query"
import { useAuth } from "@/hooks/useAuth"
import { useOrgMembers } from "@/hooks/useOrgMembers"
import {
  claimUnownedLocalData,
  countPendingLocalWork,
  type LocalDataAccess,
} from "@/lib/powersync/localDataOwner"

/**
 * The name of the account that owns this device's local data, from the
 * organisation member list. On a shared device the previous user is almost
 * always a member of the same organisation. Only a matching ID yields a name,
 * so null when they aren't a known member, have no name set, or the list
 * isn't available (e.g. offline with nothing cached).
 */
const useOwnerName = (ownerId: string | null | undefined) => {
  const { data: membersResponse } = useOrgMembers()
  if (!ownerId) return null
  const name = membersResponse?.data
    ?.find((member) => member.id === ownerId)
    ?.name?.trim()
  return name || null
}

/** Shown when this device's local data belongs to a different account. */
export function LocalDataLockedScreen({
  ownerAccess,
  ownerCheckFailed,
  onRetry,
  onClaimed,
  onClaimFailed,
}: {
  /** Null while ownership has not been resolved, e.g. after a failed check. */
  ownerAccess: LocalDataAccess | null
  ownerCheckFailed: boolean
  onRetry: () => void
  onClaimed: (access: LocalDataAccess) => void
  onClaimFailed: () => void
}) {
  const { user, mode, logout } = useAuth()
  const ownerId = ownerAccess?.ownerId
  const ownerName = useOwnerName(ownerId)
  // Devices locked before logout began releasing synced data can be locked
  // with nothing left to upload; don't tell those users there is unsynced data.
  const { data: pendingCount } = useQuery({
    queryKey: ["localDataOwner", "pending", user?.id, ownerId],
    enabled: Boolean(ownerId) && !ownerCheckFailed,
    queryFn: countPendingLocalWork,
    meta: { persisted: false },
    retry: false,
  })

  const ownerLabel = ownerName ? `account ${ownerName}` : "another account"
  const message = ownerCheckFailed
    ? "This device could not confirm which account owns its saved sync data. Try again after reconnecting the app."
    : ownerId
      ? pendingCount === 0
        ? `This device still holds data from ${ownerLabel}, all of it already uploaded. Log out and sign in again to clear it from this device.`
        : `There is still unsynced data from ${ownerLabel} on this device. Please ask them to log in and ensure all data is uploaded.`
      : "This device has saved sync data with no confirmed account owner. Sign in as its previous owner or recover the local data before using another account."

  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-medium">Local data is locked for this account.</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {ownerCheckFailed && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
      {ownerAccess?.canClaim && mode === "live" && user?.id && (
        <button
          type="button"
          onClick={() => {
            const confirmed = window.confirm(
              "This device has saved data with no verified owner. Claim it only if you are signed in as the person who created or queued that data. Other accounts must not claim it.",
            )
            if (!confirmed) return
            void claimUnownedLocalData(user.id).then(onClaimed).catch(onClaimFailed)
          }}
        >
          I’m signed in as the previous owner
        </button>
      )}
      <button type="button" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? "Logging out…" : "Log out"}
      </button>
    </div>
  )
}
