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

import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { useMixBatches } from "@/hooks/useMixBatches"

const batchMixSchema = z.object({
  notes: z.string().optional(),
})

type BatchMixFormData = z.infer<typeof batchMixSchema>

type BatchMixModalProps = {
  isOpen: boolean
  onClose: () => void
  selectedBatches: BatchWithCurrentLocationAndSpecies[]
  onSuccess?: () => void
}

export const BatchMixModal = ({
  isOpen,
  onClose,
  selectedBatches,
  onSuccess,
}: BatchMixModalProps) => {
  const { toast } = useToast()
  const mixBatchesMutation = useMixBatches()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const totalWeight = selectedBatches.reduce(
    (sum, batch) => sum + (batch.weight_grams || 0),
    0,
  )

  // Validate species match
  const speciesIds = [
    ...new Set(selectedBatches.map((b) => b.species?.id).filter(Boolean)),
  ]
  const hasMatchingSpecies = speciesIds.length === 1
  const commonSpecies = hasMatchingSpecies ? selectedBatches[0]?.species : null

  // Validate multiple collections (mixing is cross-collection)
  const collectionIds = [
    ...new Set(selectedBatches.map((b) => b.collection?.id).filter(Boolean)),
  ]
  const hasDifferentCollections = collectionIds.length > 1

  const form = useForm<BatchMixFormData>({
    resolver: zodResolver(batchMixSchema),
    defaultValues: {
      notes: "",
    },
  })

  if (!isOpen) return null

  const onSubmit = async (data: BatchMixFormData) => {
    setIsSubmitting(true)

    try {
      const sourceBatchIds = selectedBatches.map((batch) => batch.id)

      await mixBatchesMutation.mutateAsync({
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

          {/* Species Info */}
          {hasMatchingSpecies && commonSpecies && (
            <div className="border-primary/20 bg-primary/5 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Species:</span>
                <Badge variant="secondary" className="italic">
                  {commonSpecies.name}
                </Badge>
              </div>
              {!hasDifferentCollections && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Note: All batches are from the same collection. Consider using
                  merge instead if they share the same batch code.
                </p>
              )}
            </div>
          )}

          {/* Selected Batches Summary */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Source Batches ({selectedBatches.length})
            </Label>
            <div className="bg-muted/20 max-h-40 space-y-2 overflow-y-auto rounded-lg border p-3">
              {selectedBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Package className="text-primary h-4 w-4" />
                    <span className="font-mono">{batch.code}</span>
                    {batch.collection && (
                      <span className="text-muted-foreground text-xs">
                        ({batch.collection.code})
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {batch.weight_grams}g
                  </Badge>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Combined Weight:</span>
              <Badge variant="secondary">{totalWeight}g</Badge>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="mix-notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="mix-notes"
              placeholder="Notes about this mix operation..."
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
