import { useBatchHistory, useBatchSplit } from "@/hooks/useBatches"
import { useBatchProcessingEvent } from "@/hooks/useBatchProcessing"
import { useCollection } from "@/hooks/useCollection"
import { Badge } from "@nasti/ui/badge"
import { CalendarIcon, Notebook } from "lucide-react"

type BaseHistoryEvent = {
  batch_id: string
  parent_batch_id: string | null
  creation_event: "initial" | "split" | "merge" | "processing"
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

type ProcessingData = {
  batch_processing_id: string
  process: string
  quality_assessment: string
  output_weight: number
}

type ProcessingEvent = BaseHistoryEvent & {
  creation_event: "processing"
  event_details: ProcessingData
}

type InitialData = {
  collection_id: string
}

type InitialEvent = BaseHistoryEvent & {
  creation_event: "initial"
  event_details: InitialData
}

type HistoryEvent = InitialEvent | SplitEvent | MergeEvent | ProcessingEvent

const historyTypeGuards = {
  initial: (event: HistoryEvent): event is InitialEvent =>
    event.creation_event === "initial",
  split: (event: HistoryEvent): event is SplitEvent =>
    event.creation_event === "split",
  merge: (event: HistoryEvent): event is MergeEvent =>
    event.creation_event === "merge",
  processing: (event: HistoryEvent): event is ProcessingEvent =>
    event.creation_event === "processing",
}

const ProcessingEvent = ({ event }: { event: ProcessingEvent }) => {
  const { data: processingHistory, isLoading } = useBatchProcessingEvent(
    event.event_details.batch_processing_id,
  )
  if (isLoading) return <div>Loading...</div>
  if (!processingHistory) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {processingHistory.created_at &&
            new Date(processingHistory.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Processing</Badge>
        <div className="text-sm">{processingHistory.process}</div>
        {processingHistory.notes && processingHistory.notes.length > 0 && (
          <div className="bg-secondary-background/70 flex items-center gap-2 rounded px-2 py-1 text-sm">
            <Notebook className="h-4 w-4" />
            {processingHistory.notes}
          </div>
        )}
      </div>
      <div className="text-sm">
        Parent:{" "}
        <span className="font-mono font-semibold">
          {processingHistory.input_batch?.code}
        </span>
      </div>
    </div>
  )
}

const SplitEvent = ({ event }: { event: SplitEvent }) => {
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

const MergeEvent = ({ event }: { event: MergeEvent }) => {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center space-x-2">
        <CalendarIcon className="h-4 w-4" />
        <div className="text-sm">
          {event.created_at && new Date(event.created_at).toLocaleDateString()}
        </div>
        <Badge variant={"outline"}>Split</Badge>
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

const InitialEvent = ({ event }: { event: InitialEvent }) => {
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
    case "processing": {
      const isProcessing = historyTypeGuards.processing(event)
      if (!isProcessing) throw new Error("Incorrect event type: Processing")
      return <ProcessingEvent event={event} />
    }
    case "split": {
      const isSplit = historyTypeGuards.split(event)
      if (!isSplit) throw new Error("Incorrect event type: Split")
      return <SplitEvent event={event} />
    }
    case "merge": {
      const isMerge = historyTypeGuards.merge(event)
      if (!isMerge) throw new Error("Incorrect event type: Merge")
      return <MergeEvent event={event} />
    }
    case "initial": {
      const isInitial = historyTypeGuards.initial(event)
      if (!isInitial) throw new Error("Incorrect event type: Initial")
      return <InitialEvent event={event} />
    }
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
