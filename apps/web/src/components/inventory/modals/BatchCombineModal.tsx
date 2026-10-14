import { zodResolver } from "@hookform/resolvers/zod"
import { Badge } from "@nasti/ui/badge"
import { Button } from "@nasti/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Combine, Loader2, Package } from "lucide-react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useCollectionsContainers } from "@/hooks/useContainers"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useCombineBatches } from "@/hooks/useCombineBatches"
import {
  formatContainerTotal,
  totalContainerAmounts,
} from "@/lib/containerAmounts"

const batchCombineSchema = z.object({
  notes: z.string().optional(),
})

type BatchCombineFormData = z.infer<typeof batchCombineSchema>

type BatchCombineModalProps = {
  isOpen: boolean
  onClose: () => void
  selectedBatches: BatchWithCurrentLocationAndSpecies[]
  onSuccess?: () => void
}

export const BatchCombineModal = ({
  isOpen,
  onClose,
  selectedBatches,
  onSuccess,
}: BatchCombineModalProps) => {
  const { toast } = useToast()
  const combineBatchesMutation = useCombineBatches()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Combining pools batches before they are cleaned, so none has a weight yet.
  // What they do have is the containers the seed was collected into.
  const collectionIds = selectedBatches
    .map((batch) => batch.collection_id)
    .filter((id): id is string => Boolean(id))
  const {
    data: collectionContainers = [],
    isLoading: containersLoading,
    isError: containersFailed,
  } = useCollectionsContainers(collectionIds)
  const combinedContainers = totalContainerAmounts(collectionContainers)

  const hasProcessedBatch = selectedBatches.some(
    (batch) => batch.weight_grams !== null,
  )

  // Validate species match
  const speciesIds = [
    ...new Set(selectedBatches.map((b) => b.species?.id).filter(Boolean)),
  ]
  const hasMatchingSpecies = speciesIds.length === 1
  const commonSpecies = hasMatchingSpecies ? selectedBatches[0]?.species : null

  const form = useForm<BatchCombineFormData>({
    resolver: zodResolver(batchCombineSchema),
    defaultValues: {
      notes: "",
    },
  })

  if (!isOpen) return null

  const onSubmit = async (data: BatchCombineFormData) => {
    setIsSubmitting(true)

    try {
      const sourceBatchIds = selectedBatches.map((batch) => batch.id)

      await combineBatchesMutation.mutateAsync({
        sourceBatchIds,
        notes: data.notes || undefined,
      })

      toast({
        description: `Successfully Combined ${selectedBatches.length} batches`,
      })

      onSuccess?.()
      onClose()
    } catch (error) {
      console.error("Batch combine failed:", error)
      toast({
        description:
          error instanceof Error ? error.message : "Failed to combine batches",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Combine className="text-primary h-5 w-5" />
            Combine Batches
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Species Validation Warning */}
          {!hasMatchingSpecies && (
            <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
              <p className="text-destructive text-sm font-semibold">
                Cannot combine batches with different species
              </p>
              <p className="text-destructive/80 text-xs">
                All batches must have the same species to be combined.
              </p>
            </div>
          )}

          {/* Only batches that have not been cleaned can be combined */}
          {hasProcessedBatch && (
            <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
              <p className="text-destructive text-sm font-semibold">
                Cannot combine batches that have already been cleaned
              </p>
              <p className="text-destructive/80 text-xs">
                Only unprocessed batches can be combined.
              </p>
            </div>
          )}

          {/* Species Info */}
          {hasMatchingSpecies && commonSpecies && (
            <div className="border-primary/20 bg-primary/5 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Species:</span>
                <Badge variant="secondary" className="italic">
                  {commonSpecies.name}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1 text-xs">
                Batches can only be combined when they are the same species and
                from the same IBRA region.
              </p>
            </div>
          )}

          {/* Selected Batches Summary */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Source Batches ({selectedBatches.length})
            </Label>
            <div className="bg-muted/20 max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
              {selectedBatches.map((batch) => {
                const batchContainers = totalContainerAmounts(
                  collectionContainers.filter(
                    (recorded) =>
                      recorded.collection_id === batch.collection_id,
                  ),
                )

                return (
                  <div
                    key={batch.id}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="text-primary h-4 w-4 shrink-0" />
                      <span className="font-mono">{batch.code}</span>
                      {batch.collection &&
                        batch.collection.code !== batch.code && (
                          <span className="text-muted-foreground text-xs">
                            ({batch.collection.code})
                          </span>
                        )}
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {batchContainers.length > 0 ? (
                        batchContainers.map((total) => (
                          <Badge
                            key={total.containerId}
                            variant="outline"
                            className="text-xs"
                          >
                            {formatContainerTotal(total)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {containersLoading
                            ? "Loading containers…"
                            : containersFailed
                              ? "Containers unavailable"
                              : "No containers recorded"}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex items-start justify-between gap-3 text-sm font-medium">
              <span className="shrink-0">Combined Containers:</span>
              <div className="flex flex-wrap justify-end gap-1">
                {combinedContainers.length > 0 ? (
                  combinedContainers.map((total) => (
                    <Badge key={total.containerId} variant="secondary">
                      {formatContainerTotal(total)}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs font-normal">
                    {containersLoading ? "Loading…" : "None recorded"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="combine-notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="combine-notes"
              placeholder="Notes about this combine..."
              {...form.register("notes")}
            />
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !hasMatchingSpecies ||
                hasProcessedBatch ||
                selectedBatches.length < 2
              }
              className="min-w-[120px]"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Combine Batches
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
