import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useEffect, useMemo, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Checkbox } from "@nasti/ui/checkbox"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"
import { MultiSelect, type Option } from "@nasti/ui/multi-select"

import {
  type BatchCleaningWithOutputs,
  useCleanBatch,
  useUpdateBatchCleaning,
} from "@/hooks/useCleanBatch"
import {
  useBatchCleaningPhotos,
  useDeleteBatchCleaningPhoto,
  useUploadBatchCleaningPhotos,
  type BatchCleaningPhotoSignedUrl,
  type StagedCleaningPhoto,
} from "@/hooks/useBatchCleaningPhotos"
import { useCollection } from "@/hooks/useCollection"
import { BatchContainerBadges } from "@/components/inventory/BatchContainerBadges"
import {
  useCombinedSources,
  type BatchWithCurrentLocationAndSpecies,
} from "@/hooks/useBatches"
import {
  MATERIAL_TYPE_OPTIONS,
  MATERIAL_TYPES,
  isMaterialType,
  toMaterialTypes,
  type CollectionMaterialType,
} from "@nasti/common/types"
import { TaxonName } from "@nasti/common"
import { usePersons } from "@/hooks/usePersons"
import useUserStore from "@/store/userStore"
import { DurationInput } from "@/components/collections/DurationInput"

import { CleaningPhotoDropzone } from "./CleaningPhotoDropzone"

// Schema for a single cleaning output
const cleaningOutputSchema = z.object({
  enabled: z.boolean(),
  quality: z.enum(["ORG", "HQ", "LQ"]),
  material_type: z.enum(MATERIAL_TYPES),
  weight_grams: z.coerce.number().optional(),
})

// Main form schema
const batchCleaningSchema = z
  .object({
    // Initial material description
    material_type: z.enum(MATERIAL_TYPES).optional(),
    material_notes: z.string().optional(),
    // Cleaning process
    is_cleaned: z.boolean(),
    cleaning_notes: z.string().optional(),
    worker_ids: z.array(z.string().uuid()).default([]),
    duration: z.string().nullable(),
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

    if (data.is_cleaned && !data.duration) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duration is required",
        path: ["duration"],
      })
    }
  })

type BatchCleaningFormData = z.infer<typeof batchCleaningSchema>

type BatchCleaningFormProps = {
  batch: BatchWithCurrentLocationAndSpecies
  instance?: BatchCleaningWithOutputs
  onSuccess?: (cleaningId: string) => void
  onCancel?: () => void
  className?: string
}

type BatchCleaningFieldsProps = BatchCleaningFormProps & {
  /** Pre-selects the initial material when cleaning, not when editing. */
  defaultMaterialType?: CollectionMaterialType
}

const BatchCleaningFields = ({
  batch,
  instance,
  onSuccess,
  onCancel,
  className,
  defaultMaterialType,
}: BatchCleaningFieldsProps) => {
  const { toast } = useToast()
  const { mutateAsync: cleanBatchMutation, isPending: isCreating } =
    useCleanBatch()
  const { mutateAsync: updateBatchCleaning, isPending: isUpdating } =
    useUpdateBatchCleaning()
  const { uploadPhotosAsync, isUploading } = useUploadBatchCleaningPhotos()
  const { data: existingPhotos = [] } = useBatchCleaningPhotos(instance?.id)
  const { deletePhotoAsync, isDeleting } = useDeleteBatchCleaningPhoto(
    instance?.id,
  )
  const { user } = useUserStore()
  const { data: persons } = usePersons()
  const isEditing = Boolean(instance)
  // A batch with no collection of its own is a combined one, cleaned as a lot
  const { data: combinedSources } = useCombinedSources(
    batch.collection_id === null ? batch.id : undefined,
  )
  const isPending = isCreating || isUpdating
  // LQ is collapsed by default once cleaned — most cleaning runs don't produce
  // a low quality output, so it's opt-in rather than always on screen.
  const [showLqOutput, setShowLqOutput] = useState(
    () => instance?.outputs.some((output) => output.quality === "LQ") ?? false,
  )
  const [photos, setPhotos] = useState<StagedCleaningPhoto[]>([])

  const outputDefault = (
    quality: "ORG" | "HQ" | "LQ",
    enabledByDefault: boolean,
  ) => {
    const output = instance?.outputs.find(
      (candidate) => candidate.quality === quality,
    )

    return {
      enabled: output ? true : enabledByDefault,
      quality,
      material_type:
        output?.material_type && isMaterialType(output.material_type)
          ? output.material_type
          : (defaultMaterialType ?? "seed"),
      weight_grams: output?.weight_grams ?? undefined,
    }
  }

  const form = useForm<BatchCleaningFormData>({
    resolver: zodResolver(batchCleaningSchema),
    defaultValues: {
      material_type:
        instance?.material_type && isMaterialType(instance.material_type)
          ? instance.material_type
          : defaultMaterialType,
      material_notes: instance?.material_notes ?? "",
      is_cleaned: instance?.is_cleaned ?? false,
      cleaning_notes: instance?.cleaning_notes ?? "",
      worker_ids: instance?.worker_ids ?? [],
      duration: instance?.duration ?? null,
      outputs: {
        org: outputDefault("ORG", !instance),
        hq: outputDefault("HQ", false),
        lq: outputDefault("LQ", false),
      },
    },
  })

  const isCleaned = form.watch("is_cleaned")
  const materialType = form.watch("material_type")
  const selectedWorkerIds = form.watch("worker_ids")
  const workerOptions: Option[] = useMemo(
    () =>
      persons
        ?.filter(
          (person) =>
            person.is_active || selectedWorkerIds?.includes(person.id),
        )
        .map((person) => ({
          value: person.id,
          label: person.job_role
            ? `${person.display_name} (${person.job_role})`
            : person.display_name,
        })) ?? [],
    [persons, selectedWorkerIds],
  )

  useEffect(() => {
    if (instance || selectedWorkerIds.length || !user?.id || !persons) return

    const currentPerson = persons.find(
      (person) => person.source_type === "user" && person.user_id === user.id,
    )
    if (currentPerson) {
      form.setValue("worker_ids", [currentPerson.id], {
        shouldDirty: false,
        shouldValidate: true,
      })
    }
  }, [form, instance, persons, selectedWorkerIds.length, user?.id])

  const beforePhotos = photos.filter((photo) => photo.stage === "before")
  const afterPhotos = photos.filter((photo) => photo.stage === "after")
  const existingBeforePhotos = existingPhotos.filter(
    (photo) => photo.stage === "before",
  )
  const existingAfterPhotos = existingPhotos.filter(
    (photo) => photo.stage === "after",
  )

  const handleMaterialTypeChange = (
    value: CollectionMaterialType | undefined,
  ) => {
    form.setValue("material_type", value)
    // Auto-fill ORG output material type
    if (value && !isEditing) form.setValue("outputs.org.material_type", value)
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

  const handleRemoveExistingPhoto = async (
    photo: BatchCleaningPhotoSignedUrl,
  ) => {
    try {
      await deletePhotoAsync(photo)
    } catch (error) {
      console.error("Cleaning photo deletion failed:", error)
      toast({
        description: "Failed to delete cleaning photo",
        variant: "destructive",
      })
    }
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
          material_type: o.material_type,
          weight_grams: o.weight_grams as number,
        }))

      const cleaningDetails = {
        materialType: data.material_type,
        materialNotes: data.material_notes || undefined,
        cleaningNotes:
          data.is_cleaned && data.cleaning_notes
            ? data.cleaning_notes
            : undefined,
        workerIds: data.is_cleaned ? data.worker_ids : [],
        duration: data.is_cleaned ? (data.duration ?? undefined) : undefined,
      }

      if (instance) {
        cleaningId = await updateBatchCleaning({
          cleaningId: instance.id,
          ...cleaningDetails,
        })
      } else {
        cleaningId = await cleanBatchMutation({
          inputBatchId: batch.id,
          isCleaned: data.is_cleaned,
          outputs,
          ...cleaningDetails,
        })
      }
    } catch (error) {
      console.error(
        isEditing ? "Cleaning update failed:" : "Cleaning failed:",
        error,
      )
      toast({
        description: isEditing
          ? "Failed to update cleaning record"
          : "Failed to clean batch",
        variant: "destructive",
      })
      return
    }

    // The cleaning record exists now, so the staged photos can be attached.
    // A failure here doesn't undo the cleaning — say so rather than pretending
    // the whole submission failed.
    if (data.is_cleaned && photos.length > 0) {
      try {
        await uploadPhotosAsync({ cleaningId, photos })
      } catch (error) {
        console.error("Cleaning photo upload failed:", error)
        toast({
          description: isEditing
            ? "Cleaning record updated, but the photos failed to upload"
            : "Batch cleaned, but the photos failed to upload",
          variant: "destructive",
        })
        onSuccess?.(cleaningId)
        return
      }
    }

    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl))
    toast({
      description: isEditing
        ? "Successfully updated cleaning record"
        : "Successfully cleaned batch",
    })
    onSuccess?.(cleaningId)
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
          {combinedSources && combinedSources.length > 0 && (
            <p>
              <span className="font-medium">
                Combined from {combinedSources.length} collections:
              </span>{" "}
              {combinedSources
                .map((source) => source.code || "No code")
                .join(", ")}
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Containers:</span>
            <BatchContainerBadges batch={batch} />
          </div>
        </div>
      </div>

      {/* ===== Section 2: Initial Material Description ===== */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Material description</h3>

        <div className="space-y-2">
          <Label>Material type</Label>
          <div className="flex flex-wrap gap-6">
            {MATERIAL_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-2">
                <Checkbox
                  checked={materialType === option.value}
                  onCheckedChange={(checked) => {
                    handleMaterialTypeChange(checked ? option.value : undefined)
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
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
              disabled={isEditing}
              onCheckedChange={(checked) =>
                handleIsCleanedChange(Boolean(checked))
              }
            />
            Cleaned
          </label>
          {isCleaned && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-3">
              <div className="space-y-2">
                <Label>Workers</Label>
                <Controller
                  control={form.control}
                  name="worker_ids"
                  render={({ field }) => (
                    <MultiSelect
                      options={workerOptions}
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={field.value}
                      placeholder="Select workers"
                    />
                  )}
                />
              </div>
              <div>
                <Controller
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <DurationInput
                      value={field.value}
                      onChange={field.onChange}
                      required
                    />
                  )}
                />
                {form.formState.errors.duration && (
                  <p className="-mt-3 text-sm text-red-600">
                    {form.formState.errors.duration.message}
                  </p>
                )}
              </div>
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
                  existingPhotos={existingBeforePhotos}
                  photos={beforePhotos}
                  onAdd={handleAddPhotos}
                  onRemove={handleRemovePhoto}
                  onRemoveExisting={
                    isEditing ? handleRemoveExistingPhoto : undefined
                  }
                  disabled={isPending || isUploading || isDeleting}
                />
                <CleaningPhotoDropzone
                  label="Photos after cleaning"
                  stage="after"
                  existingPhotos={existingAfterPhotos}
                  photos={afterPhotos}
                  onAdd={handleAddPhotos}
                  onRemove={handleRemovePhoto}
                  onRemoveExisting={
                    isEditing ? handleRemoveExistingPhoto : undefined
                  }
                  disabled={isPending || isUploading || isDeleting}
                />
              </div>
            </div>
          )}
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
        {isEditing && (
          <p className="text-muted-foreground text-xs">
            Final material is read-only because it is linked to generated batch
            weights and lineage.
          </p>
        )}
        <div className="flex justify-between text-sm">
          <span>Quality</span>
          <span>Material type</span>
          <span>Weight</span>
        </div>

        {(["org", "hq", "lq"] as const).map((key) => {
          const qualityLabel = key.toUpperCase()
          const isEnabled = form.watch(`outputs.${key}.enabled`)
          const isDisabled = isEditing || (!isCleaned && key !== "org")
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
                  {MATERIAL_TYPE_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-center gap-1 text-sm"
                    >
                      <Checkbox
                        checked={
                          form.watch(`outputs.${key}.material_type`) ===
                          option.value
                        }
                        disabled={isDisabled || !isEnabled}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            form.setValue(
                              `outputs.${key}.material_type`,
                              option.value,
                            )
                          }
                        }}
                      />
                      {option.label}
                    </label>
                  ))}
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

        {!isEditing && isCleaned && !showLqOutput && (
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
          disabled={isPending || isUploading || isDeleting}
          className="min-w-[120px] cursor-pointer"
        >
          {(isPending || isUploading || isDeleting) && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          {isEditing ? "Save changes" : "Submit"}
        </Button>
      </div>
    </form>
  )
}

/**
 * The collection records what was collected, so a new cleaning starts from it.
 * A collection can list several types but a cleaning describes one, so the
 * first is preselected. Combined batches have no collection and start blank.
 */
export const BatchCleaningForm = (props: BatchCleaningFormProps) => {
  const { data: collection, isLoading } = useCollection(
    props.instance ? undefined : props.batch.collection_id,
  )

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <BatchCleaningFields
      {...props}
      defaultMaterialType={toMaterialTypes(collection?.material_type)[0]}
    />
  )
}
