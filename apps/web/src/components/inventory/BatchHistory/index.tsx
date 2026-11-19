import { useBatchHistory, useBatchSplit } from "@/hooks/useBatches"
import { useCollection } from "@/hooks/useCollection"
import {
  useBatchTransferEvents,
  useTransferDirectory,
  type BatchTransferEvent,
} from "@/hooks/useTransfers"
import { Badge } from "@nasti/ui/badge"
import { CalendarIcon } from "lucide-react"
import { useMemo } from "react"
import { isMaterialType, MATERIAL_TYPE_LABELS } from "@nasti/common/types"

type BaseHistoryEvent = {
  batch_id: string
  parent_batch_id: string | null
  creation_event: "initial" | "split" | "merge" | "cleaning"
  created_at: string
  event_details: Record<string, unknown>
}

type SplitData = {
  batch_split_id: string
  weight_grams: number
}

type SplitEvent = BaseHistoryEvent & {
  creation_event: "split"
  event_details: SplitData
}

type MergeData = {
  batch_merge_ids: string[]
  source_batch_ids: string[]
}

type MergeEvent = BaseHistoryEvent & {
  parent_batch_id: null
  creation_event: "merge"
  event_details: MergeData
}

type CleaningData = {
  batch_cleaning_id: string
  cleaning_output_id: string
  quality: string
  material_type: string
  output_weight: number
}

type CleaningEvent = BaseHistoryEvent & {
  creation_event: "cleaning"
  event_details: CleaningData
}

type InitialData = {
  collection_id: string
}

type InitialEvent = BaseHistoryEvent & {
  creation_event: "initial"
  event_details: InitialData
}

type HistoryEvent = InitialEvent | SplitEvent | MergeEvent | CleaningEvent

const CleaningEventComponent = ({ event }: { event: CleaningEvent }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {event.created_at && new Date(event.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Cleaning</Badge>
        <div className="text-sm">
          {event.event_details.quality} -{" "}
          {isMaterialType(event.event_details.material_type)
            ? MATERIAL_TYPE_LABELS[event.event_details.material_type]
            : event.event_details.material_type}
        </div>
      </div>
    </div>
  )
}

const SplitEventComponent = ({ event }: { event: SplitEvent }) => {
  const { data: splitHistory, isLoading } = useBatchSplit(
    event.event_details.batch_split_id,
  )
  if (isLoading) return <div>Loading...</div>
  if (!splitHistory) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {splitHistory.created_at &&
            new Date(splitHistory.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Split</Badge>
      </div>
      <div className="text-sm">
        Parent:{" "}
        <span className="font-mono font-semibold">
          {splitHistory.parent_batch.code}
        </span>
      </div>
    </div>
  )
}

const MergeEventComponent = ({ event }: { event: MergeEvent }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {event.created_at && new Date(event.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Merge</Badge>
      </div>
      <div className="text-sm">
        Parents:{" "}
        <span className="font-mono font-semibold">
          {event.event_details.source_batch_ids.length} batches
        </span>
      </div>
    </div>
  )
}

const InitialEventComponent = ({ event }: { event: InitialEvent }) => {
  const { data: collection, isLoading } = useCollection(
    event.event_details.collection_id,
  )
  if (isLoading) return <div>Loading...</div>
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm">From Collection: {collection?.code}</span>
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {event.created_at && new Date(event.created_at).toLocaleDateString()}
        </div>
      </div>
    </div>
  )
}

const EventComponentSwitch = ({ event }: { event: HistoryEvent }) => {
  switch (event.creation_event) {
    case "cleaning":
      return <CleaningEventComponent event={event} />
    case "split":
      return <SplitEventComponent event={event} />
    case "merge":
      return <MergeEventComponent event={event} />
    case "initial":
      return <InitialEventComponent event={event} />
    default:
      return <div>Unknown event type</div>
  }
}

const TransferEventComponent = ({
  event,
  recipientName,
}: {
  event: BatchTransferEvent
  recipientName: string
}) => (
  <div className="flex items-center space-x-2">
    <CalendarIcon className="h-4 w-4" />
    <div className="text-sm">
      {new Date(event.effective_at).toLocaleDateString()}
    </div>
    <Badge variant={"outline"}>Transfer</Badge>
    <div className="text-sm">
      Transferred{" "}
      <span className="font-mono font-semibold">{event.weight_grams} g</span> to{" "}
      <span className="font-semibold">{recipientName}</span>
    </div>
  </div>
)

/**
 * Ownership transfers out of this batch. Renders nothing when there are none.
 * The sender can't read the recipient's organisation row, so the name comes
 * from the transfer directory; an organisation that has since left the
 * directory shows as "another organisation".
 */
export const BatchTransferHistory = ({ batchId }: { batchId: string }) => {
  const { data: events } = useBatchTransferEvents(batchId)
  const { data: directory } = useTransferDirectory()
  const names = useMemo(
    () => new Map((directory ?? []).map((org) => [org.id, org.name])),
    [directory],
  )

  if (!events || events.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-gray-400 p-2">
      <span className="text-sm">Transfers</span>
      {events.map((event) => (
        <TransferEventComponent
          key={event.id}
          event={event}
          recipientName={
            names.get(event.recipient_org_id) ?? "another organisation"
          }
        />
      ))}
    </div>
  )
}

export const BatchHistory = ({ batchId }: { batchId: string }) => {
  const { data: event, isLoading } = useBatchHistory(batchId)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-sm border border-gray-400 p-2">
        <span className="text-sm">Batch Creation Event</span>
        {isLoading && (
          <div className="animate-pulse space-y-2">
            <div className="h-4 w-1/4 rounded bg-gray-200"></div>
          </div>
        )}
        {event && <EventComponentSwitch event={event as HistoryEvent} />}
      </div>
      <BatchTransferHistory batchId={batchId} />
    </div>
  )
}
