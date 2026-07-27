import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, ChevronDown, Check, Plus } from "lucide-react"
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
import {
  useUploadBatchCleaningPhotos,
  type StagedCleaningPhoto,
} from "@/hooks/useBatchCleaningPhotos"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { MATERIAL_SUBTYPES_BY_TYPE } from "@nasti/common/types"
import { TaxonName } from "@nasti/common"

import { CleaningPhotoDropzone } from "./CleaningPhotoDropzone"

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
  const { uploadPhotosAsync, isUploading } = useUploadBatchCleaningPhotos()
  const [subtypeOpen, setSubtypeOpen] = useState(false)
  // LQ is collapsed by default once cleaned — most cleaning runs don't produce
  // a low quality output, so it's opt-in rather than always on screen.
  const [showLqOutput, setShowLqOutput] = useState(false)
  const [photos, setPhotos] = useState<StagedCleaningPhoto[]>([])

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
  const subtypeOptions = MATERIAL_SUBTYPES_BY_TYPE[materialType]

  const beforePhotos = photos.filter((photo) => photo.stage === "before")
  const afterPhotos = photos.filter((photo) => photo.stage === "after")

  const handleMaterialTypeChange = (value: "seed" | "covering_structure") => {
    form.setValue("material_type", value)
    // Subtypes belong to one material type only, so the old choice can't stand
    form.setValue("material_subtype", "")
    // Auto-fill ORG output material type
    form.setValue("outputs.org.material_type", value)
  }

  const handleIsCleanedChange = (checked: boolean) => {
    form.setValue("is_cleaned", checked)
    if (checked) {
      // Cleaned material comes out as HQ by default — ORG describes material
      // that was left as collected, so it no longer applies.
      form.setValue("outputs.hq.enabled", true)
      form.setValue("outputs.org.enabled", false)
    } else {
      // Only ORG is valid for uncleaned material
      form.setValue("outputs.hq.enabled", false)
      form.setValue("outputs.lq.enabled", false)
      form.setValue("outputs.org.enabled", true)
      setShowLqOutput(false)
    }
  }

  const handleAddPhotos = (newPhotos: StagedCleaningPhoto[]) => {
    setPhotos((current) => [...current, ...newPhotos])
  }

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      return current.filter((photo) => photo.id !== photoId)
    })
  }

  const onSubmit = async (data: BatchCleaningFormData) => {
    let cleaningId: string
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

      cleaningId = await cleanBatchMutation({
        inputBatchId: batch.id,
        materialType: data.material_type,
        materialSubtype: data.material_subtype || undefined,
        materialNotes: data.material_notes || undefined,
        isCleaned: data.is_cleaned,
        cleaningNotes: data.cleaning_notes || undefined,
        outputs,
      })
    } catch (error) {
      console.error("Cleaning failed:", error)
      toast({
        description: "Failed to clean batch",
        variant: "destructive",
      })
      return
    }

    // The cleaning record exists now, so the staged photos can be attached.
    // A failure here doesn't undo the cleaning — say so rather than pretending
    // the whole submission failed.
    if (photos.length > 0) {
      try {
        await uploadPhotosAsync({ cleaningId, photos })
      } catch (error) {
        console.error("Cleaning photo upload failed:", error)
        toast({
          description: "Batch cleaned, but the photos failed to upload",
          variant: "destructive",
        })
        onSuccess?.()
        return
      }
    }

    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    toast({ description: "Successfully cleaned batch" })
    onSuccess?.()
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
                  if (checked) handleMaterialTypeChange("seed")
                }}
              />
              Seed
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={materialType === "covering_structure"}
                onCheckedChange={(checked) => {
                  if (checked) handleMaterialTypeChange("covering_structure")
                }}
              />
              Covering structure
            </label>
          </div>
        </div>

        {/* Material subtype dropdown — options follow the material type */}
        <div className="space-y-2">
          <Label>
            {materialType === "seed" ? "Type of seed" : "Type of structure"}
          </Label>
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
                        {subtypeOptions.map((subtype) => (
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
              onCheckedChange={(checked) =>
                handleIsCleanedChange(Boolean(checked))
              }
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

          {/* Before / after photos, staged until the cleaning record exists */}
          <div className="grid gap-4 pt-2 md:grid-cols-2">
            <CleaningPhotoDropzone
              label="Photos before cleaning"
              stage="before"
              photos={beforePhotos}
              onAdd={handleAddPhotos}
              onRemove={handleRemovePhoto}
              disabled={isPending || isUploading}
            />
            <CleaningPhotoDropzone
              label="Photos after cleaning"
              stage="after"
              photos={afterPhotos}
              onAdd={handleAddPhotos}
              onRemove={handleRemovePhoto}
              disabled={isPending || isUploading}
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

        {(["org", "hq", "lq"] as const).map((key) => {
          const qualityLabel = key.toUpperCase()
          const isEnabled = form.watch(`outputs.${key}.enabled`)
          const isDisabled = !isCleaned && key !== "org"
          // LQ only appears once it's been asked for
          if (key === "lq" && !showLqOutput) return null

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

                {/* Weight — grams, decimals allowed */}
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
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

        {isCleaned && !showLqOutput && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="cursor-pointer"
            onClick={() => {
              setShowLqOutput(true)
              form.setValue("outputs.lq.enabled", true)
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add LQ output
          </Button>
        )}

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
          disabled={isPending || isUploading}
          className="min-w-[120px] cursor-pointer"
        >
          {(isPending || isUploading) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Submit
        </Button>
      </div>
    </form>
  )
}
