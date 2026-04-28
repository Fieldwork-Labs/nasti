import { useForm, useFieldArray, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Package, Plus, Trash2 } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"

import { useSubBatches, useSplitSubBatch } from "@/hooks/useSubBatches"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

const outputSchema = z.object({
  weight_grams: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z
      .number({ invalid_type_error: "Weight is required" })
      .int()
      .min(1, "Weight must be at least 1 gram"),
  ),
  notes: z.string().optional(),
})

const splitSchema = z.object({
  outputs: z.array(outputSchema).min(1, "Add at least one output"),
})

type SplitFormInput = z.input<typeof splitSchema>
type SplitFormOutput = z.output<typeof splitSchema>

type BatchSplitFormProps = {
  parentBatch: BatchWithCurrentLocationAndSpecies
  initialSubBatchId?: string
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchSplitForm = ({
  parentBatch,
  initialSubBatchId,
  onSuccess,
  onCancel,
  className,
}: BatchSplitFormProps) => {
  const { toast } = useToast()
  const { data: subBatches } = useSubBatches(parentBatch.id)
  const splitMutation = useSplitSubBatch()
  const selectedSubBatch = subBatches?.find((sb) => sb.id === initialSubBatchId)

  const form = useForm<SplitFormInput, unknown, SplitFormOutput>({
    resolver: zodResolver(splitSchema) as Resolver<SplitFormInput>,
    defaultValues: {
      outputs: [{ weight_grams: "", notes: "" }],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "outputs",
  })

  const outputs = form.watch("outputs")
  const totalSplitWeight = outputs.reduce(
    (sum, o) => sum + (Number(o.weight_grams) || 0),
    0,
  )
  const sourceWeight = selectedSubBatch?.current_weight ?? 0
  const remainingWeight = sourceWeight - totalSplitWeight
  const allWeightsValid = outputs.every((o) => Number(o.weight_grams) > 0)
  const isValidSplit =
    allWeightsValid && totalSplitWeight > 0 && totalSplitWeight < sourceWeight

  const onSubmit = async (data: SplitFormOutput) => {
    if (!selectedSubBatch || !isValidSplit) return

    try {
      await splitMutation.mutateAsync({
        subBatchId: selectedSubBatch.id,
        outputs: data.outputs.map((o) => ({
          weight_grams: o.weight_grams,
          notes: o.notes || undefined,
        })),
      })

      toast({
        description:
          data.outputs.length === 1
            ? "Sub-batch split successfully"
            : `Sub-batch split into ${data.outputs.length} new sub-batches`,
      })
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold">
              Split Sub Batch {parentBatch.code}
            </h3>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">
                {selectedSubBatch?.current_weight}g
              </span>
              {selectedSubBatch?.notes && (
                <span className="text-muted-foreground ml-2 text-xs">
                  {selectedSubBatch?.notes}
                </span>
              )}
            </div>
            {selectedSubBatch?.current_storage?.location && (
              <span className="text-muted-foreground text-xs">
                {selectedSubBatch?.current_storage.location.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Output rows - only show when sub-batch selected */}
      {selectedSubBatch && (
        <>
          <div className="space-y-3">
            <div className="grid grid-cols-[1fr_2fr_auto] items-start gap-3 space-y-1">
              <Label>Weight *</Label>
              <Label>Notes</Label>
              <Label className="invisible">Remove</Label>

              {fields.map((_, index) => {
                const weightError =
                  form.formState.errors.outputs?.[index]?.weight_grams
                return (
                  <>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="1"
                          max={sourceWeight - 1}
                          placeholder="grams"
                          {...form.register(`outputs.${index}.weight_grams`)}
                          className="flex-1"
                        />
                        <span className="text-muted-foreground text-sm">g</span>
                      </div>
                      {weightError && (
                        <p className="text-xs text-red-600">
                          {weightError.message}
                        </p>
                      )}
                    </div>

                    <Input
                      placeholder="Optional notes..."
                      {...form.register(`outputs.${index}.notes`)}
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={fields.length === 1}
                      className="cursor-pointer"
                      aria-label="Remove output"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => append({ weight_grams: "", notes: "" })}
              className="cursor-pointer"
            >
              <Plus className="mr-2 h-4 w-4" />
              New split
            </Button>
          </div>

          {/* Weight bar visualization */}
          <div className="space-y-1">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="bg-blue-500 transition-all duration-200"
                style={{
                  width: `${Math.min((totalSplitWeight / sourceWeight) * 100, 100)}%`,
                }}
              />
              <div
                className="bg-green-500 transition-all duration-200"
                style={{
                  width: `${Math.max((remainingWeight / sourceWeight) * 100, 0)}%`,
                }}
              />
            </div>
            <div className="text-muted-foreground flex justify-between text-xs">
              <span className="text-blue-600">
                Splitting: {totalSplitWeight}g
              </span>
              <span className="text-green-600">
                Remaining: {remainingWeight > 0 ? remainingWeight : 0}g
              </span>
            </div>
          </div>

          {/* Validation message */}
          {totalSplitWeight >= sourceWeight && totalSplitWeight > 0 && (
            <p className="text-sm text-red-600">
              Total split weight must be less than the source ({sourceWeight}g)
            </p>
          )}
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
          {fields.length === 1
            ? "Split Sub-batch"
            : `Create ${fields.length} Sub-batches`}
        </Button>
      </div>
    </form>
  )
}
