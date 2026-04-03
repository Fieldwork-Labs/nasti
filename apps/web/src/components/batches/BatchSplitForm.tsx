import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"

import { useSubBatches, useSplitSubBatch } from "@/hooks/useSubBatches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import type { SubBatchWithStorage } from "@/hooks/useSubBatches"

const splitSchema = z.object({
  new_weight_grams: z.coerce.number().min(1, "Weight must be at least 1 gram"),
  notes: z.string().optional(),
})

type SplitFormData = z.infer<typeof splitSchema>

type BatchSplitFormProps = {
  parentBatch: BatchWithCurrentLocationAndSpecies
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchSplitForm = ({
  parentBatch,
  onSuccess,
  onCancel,
  className,
}: BatchSplitFormProps) => {
  const { toast } = useToast()
  const { data: subBatches, isLoading: subBatchesLoading } = useSubBatches(
    parentBatch.id,
  )
  const splitMutation = useSplitSubBatch()
  const [selectedSubBatch, setSelectedSubBatch] =
    useState<SubBatchWithStorage | null>(null)

  const form = useForm<SplitFormData>({
    resolver: zodResolver(splitSchema),
    defaultValues: {
      new_weight_grams: 0,
      notes: "",
    },
  })

  const newWeight = form.watch("new_weight_grams") || 0
  const sourceWeight = selectedSubBatch?.weight_grams ?? 0
  const remainingWeight = sourceWeight - newWeight
  const isValidSplit = newWeight > 0 && newWeight < sourceWeight

  const onSubmit = async (data: SplitFormData) => {
    if (!selectedSubBatch || !isValidSplit) return

    try {
      await splitMutation.mutateAsync({
        subBatchId: selectedSubBatch.id,
        newWeight: data.new_weight_grams,
        notes: data.notes || undefined,
      })

      toast({ description: "Sub-batch split successfully" })
      onSuccess?.()
    } catch (error) {
      console.error("Split failed:", error)
      toast({
        description: "Failed to split sub-batch",
        variant: "destructive",
      })
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={cn("space-y-6", className)}
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">
            Split Batch {parentBatch.code}
          </h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Select a sub-batch to split into two portions.
        </p>
      </div>

      {/* Sub-batch selection */}
      <div className="space-y-2">
        <Label>Select sub-batch to split</Label>
        {subBatchesLoading && (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sub-batches...
          </div>
        )}
        {subBatches && subBatches.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No sub-batches found for this batch.
          </p>
        )}
        <div className="space-y-2">
          {subBatches?.map((sb) => (
            <button
              key={sb.id}
              type="button"
              onClick={() => {
                setSelectedSubBatch(sb)
                form.setValue(
                  "new_weight_grams",
                  Math.floor(sb.weight_grams / 2),
                )
              }}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                selectedSubBatch?.id === sb.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50",
              )}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">
                    {sb.weight_grams}g
                  </span>
                  {sb.notes && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {sb.notes}
                    </span>
                  )}
                </div>
                {sb.current_storage?.location && (
                  <span className="text-muted-foreground text-xs">
                    {sb.current_storage.location.name}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Weight inputs - only show when sub-batch selected */}
      {selectedSubBatch && (
        <>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* New portion weight */}
              <div className="space-y-2">
                <Label>New portion weight *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max={sourceWeight - 1}
                    placeholder="Weight in grams"
                    {...form.register("new_weight_grams")}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground text-sm">g</span>
                </div>
                {form.formState.errors.new_weight_grams && (
                  <p className="text-xs text-red-600">
                    {form.formState.errors.new_weight_grams.message}
                  </p>
                )}
              </div>

              {/* Remaining weight (auto-calculated) */}
              <div className="space-y-2">
                <Label>Remaining in original</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    disabled
                    value={remainingWeight > 0 ? remainingWeight : 0}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground text-sm">g</span>
                </div>
              </div>
            </div>

            {/* Weight bar visualization */}
            <div className="space-y-1">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="bg-blue-500 transition-all duration-200"
                  style={{
                    width: `${Math.min((newWeight / sourceWeight) * 100, 100)}%`,
                  }}
                />
                <div
                  className="bg-green-500 transition-all duration-200"
                  style={{
                    width: `${Math.max(((sourceWeight - newWeight) / sourceWeight) * 100, 0)}%`,
                  }}
                />
              </div>
              <div className="text-muted-foreground flex justify-between text-xs">
                <span className="text-blue-600">New: {newWeight}g</span>
                <span className="text-green-600">
                  Remaining: {remainingWeight > 0 ? remainingWeight : 0}g
                </span>
              </div>
            </div>
          </div>

          {/* Validation message */}
          {newWeight >= sourceWeight && newWeight > 0 && (
            <p className="text-sm text-red-600">
              New weight must be less than the source ({sourceWeight}g)
            </p>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="split-notes">Notes</Label>
            <Input
              id="split-notes"
              placeholder="Optional notes..."
              {...form.register("notes")}
            />
          </div>
        </>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button
            type="button"
            className="cursor-pointer"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={
            !selectedSubBatch || !isValidSplit || splitMutation.isPending
          }
          className="min-w-[120px] cursor-pointer"
        >
          {splitMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Split Sub-batch
        </Button>
      </div>
    </form>
  )
}
