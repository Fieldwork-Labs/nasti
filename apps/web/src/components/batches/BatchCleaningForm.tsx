import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, ChevronDown, Check } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Checkbox } from "@nasti/ui/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"

import { useCleanBatch } from "@/hooks/useCleanBatch"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { MATERIAL_SUBTYPES } from "@nasti/common/types"
import { TaxonName } from "@nasti/common"

// Schema for a single cleaning output
const cleaningOutputSchema = z.object({
  enabled: z.boolean(),
  quality: z.enum(["ORG", "HQ", "LQ"]),
  material_type: z.enum(["seed", "covering_structure"]),
  weight_grams: z.coerce.number().optional(),
})

// Main form schema
const batchCleaningSchema = z
  .object({
    // Initial material description
    material_type: z.enum(["seed", "covering_structure"]),
    material_subtype: z.string().optional(),
    material_notes: z.string().optional(),
    // Cleaning process
    is_cleaned: z.boolean(),
    cleaning_notes: z.string().optional(),
    // Final material outputs
    outputs: z.object({
      org: cleaningOutputSchema,
      hq: cleaningOutputSchema,
      lq: cleaningOutputSchema,
    }),
  })
  .superRefine((data, ctx) => {
    // At least one output must be enabled with weight
    const enabledOutputs = [
      data.outputs.org,
      data.outputs.hq,
      data.outputs.lq,
    ].filter((o) => o.enabled)

    if (enabledOutputs.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one output must be enabled",
        path: ["outputs"],
      })
    }

    // All enabled outputs must have weight > 0
    for (const output of enabledOutputs) {
      if (!output.weight_grams || output.weight_grams <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "All enabled outputs must have a weight greater than 0",
          path: ["outputs"],
        })
        break
      }
    }

    // If not cleaned, only ORG should be enabled
    if (!data.is_cleaned) {
      if (data.outputs.hq.enabled || data.outputs.lq.enabled) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "When not cleaned, only ORG output is allowed",
          path: ["is_cleaned"],
        })
      }
    }
  })

type BatchCleaningFormData = z.infer<typeof batchCleaningSchema>

type BatchCleaningFormProps = {
  batch: BatchWithCurrentLocationAndSpecies
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchCleaningForm = ({
  batch,
  onSuccess,
  onCancel,
  className,
}: BatchCleaningFormProps) => {
  const { toast } = useToast()
  const { mutateAsync: cleanBatchMutation, isPending } = useCleanBatch()
  const [subtypeOpen, setSubtypeOpen] = useState(false)

  const form = useForm<BatchCleaningFormData>({
    resolver: zodResolver(batchCleaningSchema),
    defaultValues: {
      material_type: "seed",
      material_subtype: "",
      material_notes: "",
      is_cleaned: false,
      cleaning_notes: "",
      outputs: {
        org: {
          enabled: true,
          quality: "ORG",
          material_type: "seed",
          weight_grams: undefined,
        },
        hq: {
          enabled: false,
          quality: "HQ",
          material_type: "seed",
          weight_grams: undefined,
        },
        lq: {
          enabled: false,
          quality: "LQ",
          material_type: "seed",
          weight_grams: undefined,
        },
      },
    },
  })

  const isCleaned = form.watch("is_cleaned")
  const materialType = form.watch("material_type")

  const onSubmit = async (data: BatchCleaningFormData) => {
    try {
      const outputs = (
        [data.outputs.org, data.outputs.hq, data.outputs.lq] as const
      )
        .filter((o) => o.enabled && o.weight_grams && o.weight_grams > 0)
        .map((o) => ({
          quality: o.quality as "ORG" | "HQ" | "LQ",
          material_type: o.material_type as "seed" | "covering_structure",
          weight_grams: o.weight_grams as number,
        }))

      await cleanBatchMutation({
        inputBatchId: batch.id,
        materialType: data.material_type,
        materialSubtype: data.material_subtype || undefined,
        materialNotes: data.material_notes || undefined,
        isCleaned: data.is_cleaned,
        cleaningNotes: data.cleaning_notes || undefined,
        outputs,
      })

      toast({ description: "Successfully cleaned batch" })
      onSuccess?.()
    } catch (error) {
      console.error("Cleaning failed:", error)
      toast({
        description: "Failed to clean batch",
        variant: "destructive",
      })
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={cn("space-y-6", className)}
    >
      {/* ===== Section 1: Initial Material (display only) ===== */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">Initial material</h3>
        <div className="text-muted-foreground space-y-1 text-sm">
          {batch.collection && (
            <p>
              <span className="font-medium">Collection:</span>{" "}
              {batch.collection.code || "No code"}
            </p>
          )}
          {batch.species && (
            <p>
              <span className="font-medium">Species:</span>{" "}
              {batch.species.name ? (
                <TaxonName name={batch.species.name} />
              ) : (
                batch.collection?.field_name || "Unknown"
              )}
            </p>
          )}
          <p>
            <span className="font-medium">Collection size:</span>{" "}
            {(batch.collection && "amount_description" in batch.collection
              ? String(batch.collection.amount_description)
              : null) || "Not specified"}
          </p>
        </div>
      </div>

      {/* ===== Section 2: Initial Material Description ===== */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Material description</h3>

        {/* Seed / Covering Structure choice */}
        <div className="space-y-2">
          <Label>Material type *</Label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={materialType === "seed"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    form.setValue("material_type", "seed")
                    // Auto-fill ORG output material type
                    form.setValue("outputs.org.material_type", "seed")
                  }
                }}
              />
              Seed
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={materialType === "covering_structure"}
                onCheckedChange={(checked) => {
                  if (checked) {
                    form.setValue("material_type", "covering_structure")
                    form.setValue(
                      "outputs.org.material_type",
                      "covering_structure",
                    )
                  }
                }}
              />
              Covering structure
            </label>
          </div>
        </div>

        {/* Material subtype dropdown */}
        <div className="space-y-2">
          <Label>Type of seed or covering structure</Label>
          <Controller
            control={form.control}
            name="material_subtype"
            render={({ field }) => (
              <Popover open={subtypeOpen} onOpenChange={setSubtypeOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between"
                  >
                    {field.value
                      ? field.value.charAt(0).toUpperCase() +
                        field.value.slice(1)
                      : "Select type..."}
                    <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandEmpty>No type found.</CommandEmpty>
                      <CommandGroup>
                        {MATERIAL_SUBTYPES.map((subtype) => (
                          <CommandItem
                            key={subtype}
                            value={subtype}
                            onSelect={() => {
                              field.onChange(subtype)
                              setSubtypeOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                field.value === subtype
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {subtype.charAt(0).toUpperCase() + subtype.slice(1)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="material_notes">Notes</Label>
          <Textarea
            id="material_notes"
            placeholder="Notes about initial material..."
            {...form.register("material_notes")}
            rows={2}
          />
        </div>
      </div>

      {/* ===== Section 3: Cleaning Process ===== */}
      <div className="rounded-lg border p-4">
        <h3 className="mb-3 text-sm font-semibold">Cleaning process</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={isCleaned}
              onCheckedChange={(checked) => {
                form.setValue("is_cleaned", Boolean(checked))
                // If unchecked, disable HQ and LQ outputs
                if (!checked) {
                  form.setValue("outputs.hq.enabled", false)
                  form.setValue("outputs.lq.enabled", false)
                  // Auto-enable ORG
                  form.setValue("outputs.org.enabled", true)
                }
              }}
            />
            Cleaned
          </label>
          <div className="space-y-2">
            <Label htmlFor="cleaning_notes">Notes</Label>
            <Textarea
              id="cleaning_notes"
              placeholder="Cleaning process notes..."
              {...form.register("cleaning_notes")}
              rows={2}
            />
          </div>
        </div>
        {form.formState.errors.is_cleaned && (
          <p className="mt-1 text-sm text-red-600">
            {form.formState.errors.is_cleaned.message}
          </p>
        )}
      </div>

      {/* ===== Section 4: Final Material (outputs) ===== */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Final material</h3>
        <div className="flex justify-between text-sm">
          <span>Quality</span>
          <span>Material type</span>
          <span>Weight</span>
        </div>

        {(["org", "lq", "hq"] as const).map((key) => {
          const qualityLabel = key.toUpperCase()
          const isEnabled = form.watch(`outputs.${key}.enabled`)
          const isDisabled = !isCleaned && key !== "org"

          return (
            <div
              key={key}
              className={cn(
                "rounded-lg border p-3",
                isDisabled ? "border-gray-700 bg-gray-500 opacity-50" : "",
              )}
            >
              <div className="flex justify-between">
                {/* Quality label + enable checkbox */}
                <div className="flex min-w-[60px] items-center gap-2">
                  <Checkbox
                    checked={isEnabled}
                    disabled={isDisabled}
                    onCheckedChange={(checked) => {
                      form.setValue(`outputs.${key}.enabled`, Boolean(checked))
                    }}
                  />
                  <span className="text-sm font-bold">{qualityLabel}</span>
                </div>

                {/* Material type checkboxes */}
                <div className="space-y-1">
                  <label className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={
                        form.watch(`outputs.${key}.material_type`) === "seed"
                      }
                      disabled={isDisabled || !isEnabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          form.setValue(`outputs.${key}.material_type`, "seed")
                        }
                      }}
                    />
                    Seed
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={
                        form.watch(`outputs.${key}.material_type`) ===
                        "covering_structure"
                      }
                      disabled={isDisabled || !isEnabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          form.setValue(
                            `outputs.${key}.material_type`,
                            "covering_structure",
                          )
                        }
                      }}
                    />
                    Covering structure
                  </label>
                </div>

                {/* Weight */}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="1"
                    placeholder="Weight"
                    disabled={isDisabled || !isEnabled}
                    {...form.register(`outputs.${key}.weight_grams`)}
                    className="w-24"
                  />
                  <span className="text-muted-foreground text-sm">g</span>
                </div>
              </div>
            </div>
          )
        })}

        {form.formState.errors.outputs && (
          <p className="text-sm text-red-600">
            {typeof form.formState.errors.outputs === "object" &&
            "message" in form.formState.errors.outputs
              ? (form.formState.errors.outputs.message as string)
              : "Please check output fields"}
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
          Submit
        </Button>
      </div>
    </form>
  )
}
