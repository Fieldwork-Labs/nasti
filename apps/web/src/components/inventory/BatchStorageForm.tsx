import { type Batch } from "@nasti/common/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useMemo, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import {
  ArrowRight,
  Check,
  ChevronsUpDown,
  Loader2,
  MapPin,
  Package,
} from "lucide-react"

import {
  useStorageLocations,
  useMoveBatchToStorage,
  useRemoveBatchFromStorage,
} from "../../hooks/useBatchStorage"
import {
  useSubBatches,
  type SubBatchWithStorage,
} from "../../hooks/useSubBatches"

type BatchStorageFormData = {
  locationId: string | null
  notes: string
  storedAt: string
}

const schema = z.object({
  locationId: z.string().nullable(),
  notes: z.string().max(500, "Notes must be less than 500 characters"),
  storedAt: z
    .string()
    .min(1, "Storage date is required")
    .refine((date) => !isNaN(Date.parse(date)), "Invalid date format"),
})

type BatchStorageFormProps = {
  batch: Batch
  /** Pre-select a specific sub-batch for storage move */
  subBatchId?: string
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchStorageForm = ({
  batch,
  subBatchId: initialSubBatchId,
  onSuccess,
  onCancel,
  className,
}: BatchStorageFormProps) => {
  const { toast } = useToast()

  const { data: storageLocations, isLoading: locationsLoading } =
    useStorageLocations()
  const { data: subBatches, isLoading: subBatchesLoading } = useSubBatches(
    batch.id,
  )
  const moveBatchToStorage = useMoveBatchToStorage()
  const removeBatchFromStorage = useRemoveBatchFromStorage()

  // Sub-batch selection — auto-select if only one, or use pre-selected
  const [selectedSubBatchId, setSelectedSubBatchId] = useState<string | null>(
    initialSubBatchId ?? null,
  )

  const selectedSubBatch = useMemo(
    () => subBatches?.find((sb) => sb.id === selectedSubBatchId) ?? null,
    [subBatches, selectedSubBatchId],
  )

  // Auto-select if only one sub-batch and none pre-selected
  const effectiveSubBatch = useMemo(() => {
    if (selectedSubBatch) return selectedSubBatch
    if (subBatches?.length === 1) return subBatches[0]
    return null
  }, [selectedSubBatch, subBatches])

  const currentStorage = effectiveSubBatch?.current_storage ?? null

  const availableStorageLocations = useMemo(
    () =>
      storageLocations?.filter(
        (location) => location.id !== currentStorage?.location_id,
      ),
    [storageLocations, currentStorage],
  )

  const defaultValues = useMemo(() => {
    const now = new Date()
    const localDateTime = new Date(
      now.getTime() - now.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .slice(0, 16)

    return {
      locationId: null as string | null,
      notes: "",
      storedAt: localDateTime,
    }
  }, [])

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors, isSubmitting, isValid: baseIsValid, isDirty },
  } = useForm<BatchStorageFormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues,
  })
  // don't allow submit if form is not dirty
  const isValid = baseIsValid && isDirty

  const selectedLocationId = watch("locationId")
  const isRemoving = selectedLocationId === "remove"

  const onSubmit = useCallback(
    async (data: BatchStorageFormData) => {
      if (!effectiveSubBatch) return

      const { locationId } = data
      try {
        if (locationId && locationId !== "remove") {
          // Move to storage location
          await moveBatchToStorage.mutateAsync({
            batchId: batch.id,
            subBatchId: effectiveSubBatch.id,
            currentBatchStorageId: currentStorage?.id,
            locationId,
            notes: data.notes || undefined,
            storedAt: data.storedAt,
          })

          toast({
            description: "Sub-batch moved to storage successfully",
          })
        } else if (locationId === "remove") {
          if (!currentStorage) throw new Error("No storage location found")
          // Remove from storage
          await removeBatchFromStorage.mutateAsync({
            batchStorageId: currentStorage.id,
            notes: data.notes || undefined,
          })

          toast({
            description: "Sub-batch removed from storage successfully",
          })
        }

        onSuccess?.()
      } catch (error) {
        toast({
          variant: "destructive",
          description:
            error instanceof Error ? error.message : "Failed to update storage",
        })
      }
    },
    [
      onSuccess,
      moveBatchToStorage,
      batch.id,
      effectiveSubBatch,
      currentStorage,
      toast,
      removeBatchFromStorage,
    ],
  )

  const isLoading =
    isSubmitting ||
    locationsLoading ||
    subBatchesLoading ||
    moveBatchToStorage.isPending ||
    removeBatchFromStorage.isPending

  const hasMultipleSubBatches = Boolean(subBatches && subBatches.length > 1)
  const needsSubBatchSelection = hasMultipleSubBatches && !effectiveSubBatch

  const selectedLocation =
    !isRemoving &&
    storageLocations?.find((loc) => loc.id === selectedLocationId)

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="space-y-4">
        {/* Sub-batch selection when batch has multiple sub-batches */}
        {hasMultipleSubBatches && (
          <div className="flex flex-col gap-2">
            <Label>Sub-batch</Label>
            {subBatchesLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading sub-batches...
              </div>
            ) : (
              <div className="space-y-1">
                {subBatches?.map((sb: SubBatchWithStorage) => (
                  <button
                    key={sb.id}
                    type="button"
                    onClick={() => setSelectedSubBatchId(sb.id)}
                    className={cn(
                      "w-full rounded-lg border p-2 text-left text-sm transition-colors",
                      effectiveSubBatch?.id === sb.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">
                          {sb.weight_grams}g
                        </span>
                        {sb.notes && (
                          <span className="text-muted-foreground text-xs">
                            {sb.notes}
                          </span>
                        )}
                      </div>
                      {sb.current_storage?.location && (
                        <span className="text-muted-foreground flex items-center gap-1 text-xs">
                          <Package className="h-3 w-3" />
                          {sb.current_storage.location.name}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label>Storage Location</Label>
          <Controller
            name="locationId"
            control={control}
            render={({ field }) => (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="justify-between"
                    disabled={isLoading}
                  >
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {selectedLocation
                        ? selectedLocation.name
                        : isRemoving
                          ? "Remove from storage"
                          : field.value
                            ? "Loading..."
                            : "Select location or remove from storage"}
                    </div>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search storage locations..." />
                    <CommandList>
                      <CommandEmpty>No storage locations found.</CommandEmpty>
                      <CommandGroup>
                        {currentStorage && (
                          <CommandItem
                            value="none"
                            onSelect={() => {
                              field.onChange("remove")
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                field.value === "remove"
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            Remove from storage
                          </CommandItem>
                        )}
                        {availableStorageLocations?.map((location) => (
                          <CommandItem
                            key={location.id}
                            value={location.name}
                            onSelect={() => {
                              field.onChange(location.id)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                field.value === location.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{location.name}</span>
                              {location.description && (
                                <span className="text-muted-foreground text-xs">
                                  {location.description}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          />
          {errors.locationId && (
            <div className="flex h-4 justify-end text-xs text-orange-800">
              {errors.locationId.message}
            </div>
          )}
        </div>

        {selectedLocationId && !isRemoving && (
          <FormField
            label="Storage Date & Time"
            type="datetime-local"
            {...register("storedAt")}
            error={errors.storedAt}
            disabled={isLoading}
          />
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Optional notes about this storage operation..."
            rows={3}
            {...register("notes")}
            disabled={isLoading}
            className={cn(
              errors.notes &&
                "border-orange-800 focus:border-orange-500 focus:ring-orange-600",
            )}
          />
          {errors.notes && (
            <div className="flex h-4 justify-end text-xs text-orange-800">
              {errors.notes.message}
            </div>
          )}
          {!errors.notes && <span className="h-4" />}
        </div>

        <div className="flex gap-4">
          {currentStorage && (
            <div className="bg-muted w-full rounded-md p-3 text-sm">
              <p className="font-medium">Current Storage:</p>
              <p className="text-muted-foreground">
                {currentStorage.location?.name}
              </p>
              {currentStorage.stored_at && (
                <p className="text-muted-foreground text-xs">
                  Stored: {new Date(currentStorage.stored_at).toLocaleString()}
                </p>
              )}
            </div>
          )}
          {selectedLocation && (
            <>
              <span className="flex flex-col justify-center">
                <ArrowRight className="text-muted-foreground h-6 w-6" />
              </span>
              <div className="bg-muted w-full rounded-md p-3 text-sm">
                <p className="font-medium">New Storage:</p>
                <p className="text-muted-foreground">{selectedLocation.name}</p>
              </div>
            </>
          )}
          {isRemoving && (
            <>
              <span className="flex flex-col justify-center">
                <ArrowRight className="text-muted-foreground h-6 w-6" />
              </span>
              <div className="bg-muted w-full rounded-md p-3 text-sm">
                <p className="font-medium">Remove from Storage</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1 cursor-pointer"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1 cursor-pointer"
          disabled={!isValid || isLoading || needsSubBatchSelection}
        >
          {isLoading
            ? "Updating..."
            : isRemoving
              ? "Remove from Storage"
              : "Move"}
        </Button>
      </div>
    </form>
  )
}

// Export the schema for potential reuse
export { schema as batchStorageFormSchema }
export type { BatchStorageFormData }
