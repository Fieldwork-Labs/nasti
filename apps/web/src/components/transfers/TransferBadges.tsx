import { Badge } from "@nasti/ui/badge"
import { cn } from "@nasti/ui/utils"
import { ArrowDownToLine, Lock } from "lucide-react"

import {
  useReceivedBatchSources,
  useReceivedSeedBatchIds,
  useSubBatchReservations,
} from "@/hooks/useTransfers"

export const RECEIVED_SEED_MIX_COMBINE_MESSAGE =
  "Seed received from another organisation can't be mixed or combined yet"

export const reservedTitle = (recipientOrgName: string) =>
  `Reserved for transfer to ${recipientOrgName}. Cancel the transfer to use this bag again.`

export const ReservedForTransferBadge = ({
  recipientOrgName,
  className,
}: {
  recipientOrgName: string
  className?: string
}) => (
  <Badge
    variant="outline"
    title={reservedTitle(recipientOrgName)}
    className={cn("border-amber-500 bg-amber-50 text-amber-700", className)}
  >
    <Lock />
    Reserved for transfer to {recipientOrgName}
  </Badge>
)

export const ReceivedFromBadge = ({
  senderOrgName,
  receivedAt,
  className,
}: {
  senderOrgName: string
  receivedAt: string
  className?: string
}) => (
  <Badge
    variant="outline"
    title={`Received on ${new Date(receivedAt).toLocaleDateString()}`}
    className={cn("border-sky-500 bg-sky-50 text-sky-700", className)}
  >
    <ArrowDownToLine />
    Received from {senderOrgName}
  </Badge>
)

/** Renders nothing unless the batch was received directly in a transfer. */
export const ReceivedBatchBadge = ({
  batchId,
  className,
}: {
  batchId: string
  className?: string
}) => {
  const { data: sources } = useReceivedBatchSources()
  const source = sources?.get(batchId)
  if (!source) return null
  return (
    <ReceivedFromBadge
      senderOrgName={source.sender_org_name}
      receivedAt={source.received_at}
      className={className}
    />
  )
}

/** Whether a batch is received seed or was cleaned from received seed. */
export const useIsReceivedSeed = (batchId: string) => {
  const { data } = useReceivedSeedBatchIds()
  return Boolean(data?.has(batchId))
}

/** Reservation for a bag, if it is reserved for a pending transfer. */
export const useBagReservation = (subBatchId: string) => {
  const { data } = useSubBatchReservations()
  return data?.get(subBatchId)
}
