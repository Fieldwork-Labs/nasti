import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@nasti/ui/button"
import { useToast } from "@nasti/ui/hooks"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Loader2 } from "lucide-react"
import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { useUpdateBatch } from "@/hooks/useBatches"
import type { Batch } from "@nasti/common/types"

// NOTE: This form is now only for UPDATING existing batches
// Batches are created via processing (BatchProcessingForm), not directly

const batchFormSchema = z.object({
  notes: z.string().optional(),
})

type BatchFormData = z.infer<typeof batchFormSchema>

type BatchFormProps = {
  batch: Batch // Required - this form only updates existing batches
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchForm = ({
  batch,
  onSuccess,
  onCancel,
  className,
}: BatchFormProps) => {
  const { toast } = useToast()

  // Mutations
  const updateBatchMutation = useUpdateBatch()

  // Form setup
  const form = useForm<BatchFormData>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      notes: batch.notes || "",
    },
  })

  // Reset form values when batch or currentBatchStorage data changes
  useEffect(() => {
    form.reset({
      notes: batch.notes || "",
    })
  }, [batch, form])

  const isLoading = updateBatchMutation.isPending

  const onSubmit = async (data: BatchFormData) => {
    try {
      // Update existing batch
      await updateBatchMutation.mutateAsync({
        id: batch.id,
        notes: data.notes,
      })

      toast({
        description: "Batch updated successfully",
      })

      onSuccess?.()
    } catch (error) {
      toast({
        description: "Failed to update batch",
        variant: "destructive",
      })
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={`space-y-6 ${className}`}
    >
      {/* Batch Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Additional notes about this batch..."
          {...form.register("notes")}
        />
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}
