import { Button } from "@nasti/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"
import { Label } from "@nasti/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { Textarea } from "@nasti/ui/textarea"
import { Loader2, Merge } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"

import { useActiveContainers } from "@/hooks/useContainers"
import {
  type SubBatchWithStorage,
  useMergeSubBatches,
} from "@/hooks/useSubBatches"
import { useActiveStorageLocations } from "@/hooks/useStorageLocations"

const NO_LOCATION = "__none__"

type SubBatchMergeModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  subBatches: SubBatchWithStorage[]
}

const getSharedValue = (values: Array<string | null | undefined>) => {
  const first = values[0]
  return first && values.every((value) => value === first) ? first : ""
}

const formatWeight = (weight: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(weight)

export const SubBatchMergeModal = ({
  isOpen,
  onClose,
  onSuccess,
  subBatches,
}: SubBatchMergeModalProps) => {
  const { toast } = useToast()
  const mergeSubBatches = useMergeSubBatches()
  const {
    data: containers = [],
    isLoading: containersLoading,
    isError: containersFailed,
    error: containersError,
  } = useActiveContainers("storage")
  const {
    data: locations = [],
    isLoading: locationsLoading,
    isError: locationsFailed,
    error: locationsError,
  } = useActiveStorageLocations()
  const [containerId, setContainerId] = useState("")
  const [locationId, setLocationId] = useState("")
  const [notes, setNotes] = useState("")
  const [submissionError, setSubmissionError] = useState<string>()
  const containerDefaultApplied = useRef(false)
  const locationDefaultApplied = useRef(false)

  const totalWeight = useMemo(
    () =>
      subBatches.reduce(
        (total, subBatch) => total + (subBatch.current_weight ?? 0),
        0,
      ),
    [subBatches],
  )
  const sharedContainerId = getSharedValue(
    subBatches.map((subBatch) => subBatch.container_id),
  )
  const sharedLocationId = getSharedValue(
    subBatches.map(
      (subBatch) =>
        subBatch.current_storage?.location_id ?? subBatch.current_location_id,
    ),
  )

  useEffect(() => {
    if (!isOpen) return

    if (
      !containerDefaultApplied.current &&
      !containersLoading &&
      sharedContainerId &&
      containers.some((container) => container.id === sharedContainerId)
    ) {
      setContainerId(sharedContainerId)
    }
    if (!containersLoading) containerDefaultApplied.current = true

    if (
      !locationDefaultApplied.current &&
      !locationsLoading &&
      sharedLocationId &&
      locations.some((location) => location.id === sharedLocationId)
    ) {
      setLocationId(sharedLocationId)
    }
    if (!locationsLoading) locationDefaultApplied.current = true
  }, [
    containers,
    containersLoading,
    isOpen,
    locations,
    locationsLoading,
    sharedContainerId,
    sharedLocationId,
  ])

  if (!isOpen) return null

  const isLoading = containersLoading
  const hasCatalogueError = containersFailed
  const cannotSubmit =
    isLoading ||
    hasCatalogueError ||
    containers.length === 0 ||
    !containerId ||
    mergeSubBatches.isPending

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setSubmissionError(undefined)

    if (!containerId) {
      setSubmissionError("Select a destination container.")
      return
    }

    try {
      await mergeSubBatches.mutateAsync({
        subBatchIds: subBatches.map((subBatch) => subBatch.id),
        containerId,
        locationId,
        notes: notes.trim() || undefined,
      })
      toast({
        description: `${subBatches.length} bags merged successfully`,
      })
      onSuccess?.()
      onClose()
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Failed to merge bags.",
      )
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !mergeSubBatches.isPending) onClose()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5" />
            Merge bags
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-muted-foreground text-sm">
            Combine {subBatches.length} selected bags (
            {formatWeight(totalWeight)} g) into one new stored bag.
          </p>

          {containersFailed && (
            <p className="text-destructive text-sm">
              Failed to load storage containers
              {containersError?.message ? `: ${containersError.message}` : "."}
            </p>
          )}
          {locationsFailed && (
            <p className="text-destructive text-sm">
              Failed to load storage locations
              {locationsError?.message ? `: ${locationsError.message}` : "."}
            </p>
          )}
          {!isLoading && !containersFailed && containers.length === 0 && (
            <p className="text-destructive text-sm">
              Add an active storage container type in organisation settings
              before merging.
            </p>
          )}
          <div className="space-y-2">
            <Label>Destination container</Label>
            <Select
              value={containerId}
              onValueChange={(value) => {
                setContainerId(value)
                setSubmissionError(undefined)
              }}
              disabled={containersLoading || containersFailed}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select container type" />
              </SelectTrigger>
              <SelectContent>
                {containers.map((container) => (
                  <SelectItem key={container.id} value={container.id}>
                    {container.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Destination storage location (optional)</Label>
            <Select
              value={locationId || NO_LOCATION}
              onValueChange={(value) => {
                setLocationId(value === NO_LOCATION ? "" : value)
                setSubmissionError(undefined)
              }}
              disabled={locationsLoading || locationsFailed}
            >
              <SelectTrigger>
                <SelectValue placeholder="No location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LOCATION}>No location</SelectItem>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sub-batch-merge-notes">Notes (optional)</Label>
            <Textarea
              id="sub-batch-merge-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes about this merge"
            />
          </div>

          {submissionError && (
            <p className="text-destructive text-sm">{submissionError}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={mergeSubBatches.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={cannotSubmit}>
              {mergeSubBatches.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Merge bags
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
