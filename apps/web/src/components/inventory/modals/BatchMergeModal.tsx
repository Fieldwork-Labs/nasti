import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Package, Merge } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Badge } from "@nasti/ui/badge"
import { useToast } from "@nasti/ui/hooks"

import { useMergeBatches } from "@/hooks/useBatches"
import type {
  BatchWithCurrentLocationAndSpecies,
  BatchFilter,
} from "@/hooks/useBatches"
import { invalidateBatchesByFilterCache } from "@/hooks/useBatches"

const batchMergeSchema = z.object({
  notes: z.string().optional(),
})

type BatchMergeFormData = z.infer<typeof batchMergeSchema>

type BatchMergeModalProps = {
  isOpen: boolean
  onClose: () => void
  selectedBatches: BatchWithCurrentLocationAndSpecies[]
  batchFilter: BatchFilter
}

export const BatchMergeModal = ({
  isOpen,
  onClose,
  selectedBatches,
  batchFilter,
}: BatchMergeModalProps) => {
  const { toast } = useToast()
  const mergeBatchesMutation = useMergeBatches()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate aggregate data
  const totalWeight = selectedBatches.reduce(
    (sum, batch) => sum + (batch.weight_grams || 0),
    0,
  )

  // Validate that all batches have the same code
  const batchCodes = [...new Set(selectedBatches.map((batch) => batch.code))]
  const hasMatchingCodes = batchCodes.length === 1
  const commonCode = hasMatchingCodes ? batchCodes[0] : null

  const form = useForm<BatchMergeFormData>({
    resolver: zodResolver(batchMergeSchema),
    defaultValues: {
      notes: "",
    },
  })

  if (!isOpen) return null

  const onSubmit = async (data: BatchMergeFormData) => {
    setIsSubmitting(true)

    try {
      const sourceBatchIds = selectedBatches.map((batch) => batch.id)

      await mergeBatchesMutation.mutateAsync({
        sourceBatchIds,
        notes:
          data.notes ||
          `Merged from ${sourceBatchIds.length} batches: ${sourceBatchIds.map((id) => id.slice(0, 8)).join(", ")}`,
      })

      toast({
        description: `Successfully merged ${selectedBatches.length} batches`,
      })

      invalidateBatchesByFilterCache(batchFilter)
      onClose()
    } catch (error) {
      console.error("Merge failed:", error)
      toast({
        description: "Failed to merge batches",
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
            <Merge className="text-primary h-5 w-5" />
            Merge Batches
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Code Validation Warning */}
          {!hasMatchingCodes && (
            <div className="border-destructive bg-destructive/10 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <div className="text-destructive mt-0.5">
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-destructive text-sm font-semibold">
                    Cannot Merge Batches with Different Codes
                  </p>
                  <p className="text-destructive/80 text-xs">
                    All batches must have the same code to be merged. Found
                    codes: {batchCodes.join(", ")}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Batch Code Info */}
          {hasMatchingCodes && commonCode && (
            <div className="border-primary/20 bg-primary/5 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Package className="text-primary h-4 w-4" />
                <span className="text-sm font-medium">Batch Code:</span>
                <Badge variant="secondary" className="font-mono">
                  {commonCode}
                </Badge>
              </div>
            </div>
          )}

          {/* Selected Batches Summary */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Selected Batches ({selectedBatches.length})
            </Label>
            <div className="bg-muted/20 max-h-32 space-y-2 overflow-y-auto rounded-lg border p-3">
              {selectedBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Package className="text-primary h-4 w-4" />
                    <span className="font-mono">{batch.code}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {batch.weight_grams}g
                  </Badge>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total Weight:</span>
              <Badge variant="secondary">{totalWeight}g</Badge>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-sm font-medium">
              Notes
            </Label>
            <Textarea
              id="notes"
              placeholder="Additional notes about this merge operation..."
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
              disabled={isSubmitting || !hasMatchingCodes}
              className="min-w-[120px]"
            >
              {isSubmitting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Merge Batches
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
