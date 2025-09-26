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
import { Checkbox } from "@nasti/ui/checkbox"
import { Badge } from "@nasti/ui/badge"
import { useToast } from "@nasti/ui/hooks"

import { useMergeBatches } from "@/hooks/useBatches"
import type {
  BatchWithCurrentLocationAndSpecies,
  BatchFilter,
} from "@/hooks/useBatches"
import { invalidateBatchesByFilterCache } from "@/hooks/useBatches"

const batchMergeSchema = z.object({
  is_extracted: z.boolean().default(false),
  is_treated: z.boolean().default(false),
  is_sorted: z.boolean().default(false),
  is_coated: z.boolean().default(false),
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
  const allExtracted = selectedBatches.every((batch) => batch.is_extracted)
  const allTreated = selectedBatches.every((batch) => batch.is_treated)
  const allSorted = selectedBatches.every((batch) => batch.is_sorted)
  const allCoated = selectedBatches.every((batch) => batch.is_coated)

  const form = useForm<BatchMergeFormData>({
    resolver: zodResolver(batchMergeSchema),
    defaultValues: {
      is_extracted: allExtracted,
      is_treated: allTreated,
      is_sorted: allSorted,
      is_coated: allCoated,
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
        is_extracted: data.is_extracted,
        is_treated: data.is_treated,
        is_sorted: data.is_sorted,
        is_coated: data.is_coated,
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
                    <span className="font-mono">{batch.id.slice(0, 8)}...</span>
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

          {/* Processing Status */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Processing Status</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_extracted"
                  checked={form.watch("is_extracted")}
                  onCheckedChange={(checked) =>
                    form.setValue("is_extracted", Boolean(checked))
                  }
                />
                <Label htmlFor="is_extracted" className="text-sm font-normal">
                  Extracted{" "}
                  {allExtracted && (
                    <span className="text-primary text-xs">(all)</span>
                  )}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_treated"
                  checked={form.watch("is_treated")}
                  onCheckedChange={(checked) =>
                    form.setValue("is_treated", Boolean(checked))
                  }
                />
                <Label htmlFor="is_treated" className="text-sm font-normal">
                  Treated{" "}
                  {allTreated && (
                    <span className="text-primary text-xs">(all)</span>
                  )}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_sorted"
                  checked={form.watch("is_sorted")}
                  onCheckedChange={(checked) =>
                    form.setValue("is_sorted", Boolean(checked))
                  }
                />
                <Label htmlFor="is_sorted" className="text-sm font-normal">
                  Sorted{" "}
                  {allSorted && (
                    <span className="text-primary text-xs">(all)</span>
                  )}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_coated"
                  checked={form.watch("is_coated")}
                  onCheckedChange={(checked) =>
                    form.setValue("is_coated", Boolean(checked))
                  }
                />
                <Label htmlFor="is_coated" className="text-sm font-normal">
                  Coated{" "}
                  {allCoated && (
                    <span className="text-primary text-xs">(all)</span>
                  )}
                </Label>
              </div>
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
              disabled={isSubmitting}
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
