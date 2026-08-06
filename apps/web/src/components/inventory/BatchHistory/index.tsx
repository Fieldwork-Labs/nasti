import { useBatchHistory, useBatchSplit } from "@/hooks/useBatches"
import { useTreatmentEvent } from "@/hooks/useBatchTreating"
import { useCollection } from "@/hooks/useCollection"
import { Badge } from "@nasti/ui/badge"
import { CalendarIcon, Notebook } from "lucide-react"

type BaseHistoryEvent = {
  batch_id: string
  parent_batch_id: string | null
  creation_event: "initial" | "split" | "merge" | "treating" | "cleaning"
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

type TreatmentData = {
  treatment_id: string
  treat: string[]
  quality_assessment: string
  output_weight: number
}

type TreatmentEvent = BaseHistoryEvent & {
  creation_event: "treating"
  event_details: TreatmentData
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

type HistoryEvent =
  | InitialEvent
  | SplitEvent
  | MergeEvent
  | TreatmentEvent
  | CleaningEvent

const TreatmentEventComponent = ({ event }: { event: TreatmentEvent }) => {
  const { data: treatmentHistory, isLoading } = useTreatmentEvent(
    event.event_details.treatment_id,
  )
  if (isLoading) return <div>Loading...</div>
  if (!treatmentHistory) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {treatmentHistory.created_at &&
            new Date(treatmentHistory.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Treatment</Badge>
        <div className="text-sm">{treatmentHistory.treat.join(", ")}</div>
        {treatmentHistory.notes && treatmentHistory.notes.length > 0 && (
          <div className="bg-secondary-background/70 flex items-center gap-2 rounded px-2 py-1 text-sm">
            <Notebook className="h-4 w-4" />
            {treatmentHistory.notes}
          </div>
        )}
      </div>
      <div className="text-sm">
        Parent:{" "}
        <span className="font-mono font-semibold">
          {treatmentHistory.input_batch?.code}
        </span>
      </div>
    </div>
  )
}

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
          {event.event_details.quality} - {event.event_details.material_type}
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
    case "treating":
      return <TreatmentEventComponent event={event} />
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

export const BatchHistory = ({ batchId }: { batchId: string }) => {
  const { data: event, isLoading } = useBatchHistory(batchId)

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-gray-400 p-2">
      <span className="text-sm">Batch Creation Event</span>
      {isLoading && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 w-1/4 rounded bg-gray-200"></div>
        </div>
      )}
      {event && <EventComponentSwitch event={event as HistoryEvent} />}
    </div>
  )
}
