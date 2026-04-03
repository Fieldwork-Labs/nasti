import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, ChevronDown, Check } from "lucide-react"
import { Button } from "@nasti/ui/button"
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

import { useTreatBatch } from "@/hooks/useTreatBatch"
import { cn } from "@nasti/ui/utils"
import { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { Checkbox } from "@nasti/ui/checkbox"
import { Input } from "@nasti/ui/input"

type TreatTypes = "sort" | "coat" | "treat" | "other"

const treatTypes: Array<{ value: TreatTypes; label: string }> = [
  { value: "sort", label: "Sort" },
  { value: "coat", label: "Coat" },
  { value: "treat", label: "Treat" },
  { value: "other", label: "Other" },
]

const qualityOptions = [
  { value: "ORG", label: "ORG - Original" },
  { value: "HQ", label: "HQ - High Quality" },
  { value: "LQ", label: "LQ - Low Quality" },
]

const treatmentSchema = z.object({
  treat: z
    .array(z.enum(["sort", "coat", "treat", "other"]))
    .min(1, "At least one treatment type must be selected"),
  qualityAssessment: z.enum(["ORG", "HQ", "LQ"]),
  outputWeight: z.coerce
    .number()
    .min(1, "Output weight must be at least 1 gram"),
  notes: z.string().optional(),
})

type TreatmentFormData = z.infer<typeof treatmentSchema>

type BatchTreatmentFormProps = {
  batch: BatchWithCurrentLocationAndSpecies
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchTreatmentForm = ({
  batch,
  onSuccess,
  onCancel,
  className,
}: BatchTreatmentFormProps) => {
  const { toast } = useToast()
  const { mutateAsync: treatBatchMutation, isPending } = useTreatBatch()
  const [qualityOpen, setQualityOpen] = useState(false)

  const form = useForm<TreatmentFormData>({
    resolver: zodResolver(treatmentSchema),
    defaultValues: {
      treat: [],
      qualityAssessment: "HQ",
      outputWeight: 0,
      notes: "",
    },
  })

  const onSubmit = async (data: TreatmentFormData) => {
    try {
      await treatBatchMutation({
        inputBatchId: batch.id,
        outputWeight: data.outputWeight,
        treatment: data.treat,
        qualityAssessment: data.qualityAssessment,
        notes: data.notes,
      })

      toast({
        description: "Successfully treated batch",
      })

      onSuccess?.()
    } catch (error) {
      console.error("Treatment failed:", error)
      toast({
        description: "Failed to treat batch",
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
          {batch.collection && (
            <p>
              Amount:{" "}
              {((batch.collection as Record<string, unknown>)
                .amount_description as string) || "Not specified"}
            </p>
          )}
          {batch.weights && (
            <p>Current Weight: {batch.weights.current_weight}g</p>
          )}
        </div>
      </div>

      {/* Treatment Type */}
      <div className="space-y-2">
        <Label htmlFor="treat">Treatment Types *</Label>
        <div className="grid w-1/2 grid-cols-2 space-y-2">
          {treatTypes.map(({ label, value }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={value}
                checked={form.watch("treat").includes(value)}
                onCheckedChange={(_checked) => {
                  const currentValues = form.watch("treat")
                  const newValues: TreatmentFormData["treat"] = _checked
                    ? [...currentValues, value]
                    : currentValues.filter((v) => v !== value)
                  form.setValue("treat", newValues)
                }}
              />
              <Label htmlFor={value}>{label}</Label>
            </div>
          ))}
        </div>
        {form.formState.errors.treat && (
          <p className="text-sm text-red-600">
            {form.formState.errors.treat.message}
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
                          qo.value as "ORG" | "HQ" | "LQ",
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

      {/* Output Weight */}
      <div className="space-y-2">
        <Label htmlFor="outputWeight">Output Weight (grams) *</Label>
        <div className="flex items-center gap-2">
          <Input
            id="outputWeight"
            type="number"
            min="1"
            placeholder="Enter treated batch weight"
            {...form.register("outputWeight")}
            className="flex-1"
          />
          <span className="text-muted-foreground min-w-[20px] text-sm">g</span>
        </div>
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
          placeholder="Additional treatment notes..."
          {...form.register("notes")}
          rows={3}
        />
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
          Treat Batch
        </Button>
      </div>
    </form>
  )
}
