import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, ChevronDown, Check } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useToast } from "@nasti/ui/hooks"

import { useProcessBatch } from "@/hooks/useProcessBatch"
import type { Batch } from "@nasti/common/types"
import { cn } from "@nasti/ui/utils"

// Process type options
const processTypes = [
  { value: "clean", label: "Clean" },
  { value: "sort", label: "Sort" },
  { value: "coat", label: "Coat" },
  { value: "treat", label: "Treat" },
  { value: "other", label: "Other" },
]

// Quality assessment options
const qualityOptions = [
  { value: "ORG", label: "ORG - Original/Organic" },
  { value: "HQ", label: "HQ - High Quality" },
  { value: "MQ", label: "MQ - Medium Quality" },
  { value: "LQ", label: "LQ - Low Quality" },
]

// Batch processing form schema
const batchProcessingSchema = z
  .object({
    process: z.enum(["clean", "sort", "coat", "treat", "other"]),
    qualityAssessment: z.enum(["ORG", "HQ", "MQ", "LQ"]),
    outputWeight: z.coerce
      .number()
      .min(1, "Output weight must be at least 1 gram"),
    inputWeight: z.coerce.number(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      // If inputWeight is provided, it must be > 0
      if (data.inputWeight !== undefined) {
        return data.inputWeight > 0
      }
      return true
    },
    {
      message: "Origin batch weight must be greater than 0",
      path: ["inputWeight"],
    },
  )
  .refine(
    (data) => {
      // Output weight must be equal to or less than input weight
      if (data.inputWeight !== undefined) {
        return data.inputWeight >= data.outputWeight
      }
      return true
    },
    {
      message: "Output weight must be equal to or less than input weight",
      path: ["outputWeight"],
    },
  )

type BatchProcessingFormData = z.infer<typeof batchProcessingSchema>

type BatchWithRelations = Batch & {
  collection?: {
    id: string
    field_name: string | null
    code: string | null
  }
  species?: {
    id: string
    name: string | null
  } | null
}

type BatchProcessingFormProps = {
  batch: BatchWithRelations
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchProcessingForm = ({
  batch,
  onSuccess,
  onCancel,
  className,
}: BatchProcessingFormProps) => {
  const { toast } = useToast()
  const { mutateAsync: processBatchMutation, isPending } = useProcessBatch()
  const [processTypeOpen, setProcessTypeOpen] = useState(false)
  const [qualityOpen, setQualityOpen] = useState(false)

  // Determine if origin weight is required (batch has NULL weight)
  const requiresOriginWeight = batch.weight_grams === null

  // Form setup
  const form = useForm<BatchProcessingFormData>({
    resolver: zodResolver(batchProcessingSchema),
    defaultValues: {
      process: "clean",
      qualityAssessment: "HQ",
      outputWeight: 0,
      inputWeight: batch.weight_grams ?? undefined,
      notes: "",
    },
  })

  const onSubmit = async (data: BatchProcessingFormData) => {
    try {
      // If batch has NULL weight and origin weight is required, ensure it's provided
      if (requiresOriginWeight && !data.inputWeight) {
        toast({
          description:
            "Origin batch weight is required for batches without weight",
          variant: "destructive",
        })
        return
      }

      await processBatchMutation({
        inputBatchId: batch.id,
        originBatchWeight: data.inputWeight,
        outputWeight: data.outputWeight,
        process: data.process,
        qualityAssessment: data.qualityAssessment,
        notes: data.notes,
      })

      toast({
        description: "Successfully processed batch",
      })

      onSuccess?.()
    } catch (error) {
      console.error("Processing failed:", error)
      toast({
        description: "Failed to process batch",
        variant: "destructive",
      })
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={cn("space-y-6", className)}
    >
      {/* Header Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2"></div>
        <div className="text-muted-foreground space-y-1 text-sm">
          {batch.collection && (
            <p>Collection: {batch.collection.code || "No code"}</p>
          )}
          {batch.species && (
            <p>
              Species:{" "}
              {batch.species.name || batch.collection?.field_name || "Unknown"}
            </p>
          )}
          {batch.weight_grams !== null && (
            <p>Current Weight: {batch.weight_grams}g</p>
          )}
          {batch.weight_grams === null && (
            <p className="text-amber-600">Initial batch (no weight set)</p>
          )}
        </div>
      </div>

      {/* Process Type */}
      <div className="space-y-2">
        <Label htmlFor="process">Process Type *</Label>
        <Popover open={processTypeOpen} onOpenChange={setProcessTypeOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between"
            >
              {processTypes.find((pt) => pt.value === form.watch("process"))
                ?.label || "Select process type"}
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>No process type found.</CommandEmpty>
                <CommandGroup>
                  {processTypes.map((pt) => (
                    <CommandItem
                      key={pt.value}
                      value={pt.value}
                      onSelect={() => {
                        form.setValue(
                          "process",
                          pt.value as
                            | "clean"
                            | "sort"
                            | "coat"
                            | "treat"
                            | "other",
                        )
                        setProcessTypeOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          form.watch("process") === pt.value
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {pt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.formState.errors.process && (
          <p className="text-sm text-red-600">
            {form.formState.errors.process.message}
          </p>
        )}
      </div>

      {/* Quality Assessment */}
      <div className="space-y-2">
        <Label htmlFor="qualityAssessment">Quality Assessment *</Label>
        <Popover open={qualityOpen} onOpenChange={setQualityOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-between"
            >
              {qualityOptions.find(
                (qo) => qo.value === form.watch("qualityAssessment"),
              )?.label || "Select quality"}
              <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandList>
                <CommandEmpty>No quality option found.</CommandEmpty>
                <CommandGroup>
                  {qualityOptions.map((qo) => (
                    <CommandItem
                      key={qo.value}
                      value={qo.value}
                      onSelect={() => {
                        form.setValue(
                          "qualityAssessment",
                          qo.value as "ORG" | "HQ" | "MQ" | "LQ",
                        )
                        setQualityOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          form.watch("qualityAssessment") === qo.value
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {qo.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.formState.errors.qualityAssessment && (
          <p className="text-sm text-red-600">
            {form.formState.errors.qualityAssessment.message}
          </p>
        )}
      </div>

      {/* Origin Batch Weight (only if processing origin batch without weight) */}
      {requiresOriginWeight && (
        <div className="space-y-2">
          <Label htmlFor="inputWeight">Input Weight (grams) *</Label>
          <div className="flex items-center gap-2">
            <Input
              id="inputWeight"
              type="number"
              min="1"
              placeholder="Enter raw material weight"
              {...form.register("inputWeight")}
              className="flex-1"
            />
            <span className="text-muted-foreground min-w-[20px] text-sm">
              g
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            This will be recorded as the original weight of the unprocessed
            batch
          </p>
          {form.formState.errors.inputWeight && (
            <p className="text-sm text-red-600">
              {form.formState.errors.inputWeight.message}
            </p>
          )}
        </div>
      )}

      {/* Output Weight */}
      <div className="space-y-2">
        <Label htmlFor="outputWeight">Output Weight (grams) *</Label>
        <div className="flex items-center gap-2">
          <Input
            id="outputWeight"
            type="number"
            min="1"
            placeholder="Enter processed batch weight"
            {...form.register("outputWeight")}
            className="flex-1"
          />
          <span className="text-muted-foreground min-w-[20px] text-sm">g</span>
        </div>
        <p className="text-muted-foreground text-xs">
          Weight of the resulting batch after processing
        </p>
        {form.formState.errors.outputWeight && (
          <p className="text-sm text-red-600">
            {form.formState.errors.outputWeight.message}
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          placeholder="Additional processing notes..."
          {...form.register("notes")}
          rows={3}
        />
        {form.formState.errors.notes && (
          <p className="text-sm text-red-600">
            {form.formState.errors.notes.message}
          </p>
        )}
      </div>

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
          disabled={isPending}
          className="min-w-[120px] cursor-pointer"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Process Batch
        </Button>
      </div>
    </form>
  )
}
