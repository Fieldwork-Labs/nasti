import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useToast } from "@nasti/ui/hooks"

import {
  useStorageLocations,
  useCurrentBatchStorage,
  useUpdateStorageRecord,
  useCreateStorageRecord,
} from "@/hooks/useBatchStorage"
import { useUpdateBatch } from "@/hooks/useBatches"
import type { Batch, StorageLocation } from "@nasti/common/types"

// NOTE: This form is now only for UPDATING existing batches
// Batches are created via processing (BatchProcessingForm), not directly

const batchFormSchema = z.object({
  notes: z.string().optional(),
  storage_location_id: z.string().optional(),
  storage_notes: z.string().optional(),
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
  const [storageLocationSearchOpen, setStorageLocationSearchOpen] =
    useState(false)
  const [storageLocationSearchTerm, setStorageLocationSearchTerm] = useState("")

  // Hooks for data fetching
  const { data: storageLocations } = useStorageLocations()
  const { data: currentBatchStorage } = useCurrentBatchStorage(batch.id)

  // Mutations
  const updateBatchMutation = useUpdateBatch()
  const createStorage = useCreateStorageRecord()
  const updateStorage = useUpdateStorageRecord()

  // Form setup
  const form = useForm<BatchFormData>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      notes: batch.notes || "",
      storage_location_id: "",
      storage_notes: "",
    },
  })

  // Reset form values when batch or currentBatchStorage data changes
  useEffect(() => {
    form.reset({
      notes: batch.notes || "",
      storage_location_id: currentBatchStorage?.location_id || "",
      storage_notes: currentBatchStorage?.notes || "",
    })
  }, [batch, currentBatchStorage, form])

  // Filter storage locations
  const filteredStorageLocations = storageLocations?.filter(
    (location: StorageLocation) =>
      location.name
        .toLowerCase()
        .includes(storageLocationSearchTerm.toLowerCase()) ||
      location.description
        ?.toLowerCase()
        .includes(storageLocationSearchTerm.toLowerCase()),
  )

  // Get selected storage location
  const selectedStorageLocation = storageLocations?.find(
    (l: StorageLocation) => l.id === form.watch("storage_location_id"),
  )

  const isLoading = updateBatchMutation.isPending

  const onSubmit = async (data: BatchFormData) => {
    try {
      // Update existing batch
      await updateBatchMutation.mutateAsync({
        id: batch.id,
        notes: data.notes,
      })

      // Handle storage location
      if (currentBatchStorage) {
        await updateStorage.mutateAsync({
          locationId: data.storage_location_id,
          notes: data.storage_notes,
          storageId: currentBatchStorage.id,
        })
      } else if (data.storage_location_id) {
        // Create new storage record
        await createStorage.mutateAsync({
          locationId: data.storage_location_id,
          batchId: batch.id,
          notes: data.storage_notes,
        })
      }

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
      {/* Storage Location Selection */}
      <div className="space-y-2">
        <Label htmlFor="storage_location">Storage Location</Label>
        <Popover
          open={storageLocationSearchOpen}
          onOpenChange={setStorageLocationSearchOpen}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-start"
              disabled
            >
              {selectedStorageLocation ? (
                <span className="truncate">{selectedStorageLocation.name}</span>
              ) : (
                <span className="text-muted-foreground">
                  No storage location selected
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command filter={() => 1}>
              <CommandInput
                placeholder="Search storage locations..."
                value={storageLocationSearchTerm}
                onValueChange={setStorageLocationSearchTerm}
              />
              <CommandList>
                <CommandEmpty>No storage locations found.</CommandEmpty>
                <CommandGroup>
                  {form.watch("storage_location_id") && (
                    <CommandItem
                      value="none"
                      onSelect={() => {
                        form.setValue("storage_location_id", "")
                        setStorageLocationSearchOpen(false)
                      }}
                    >
                      <span className="text-muted-foreground">
                        No storage location
                      </span>
                    </CommandItem>
                  )}
                  {filteredStorageLocations?.map(
                    (location: StorageLocation) => (
                      <CommandItem
                        key={location.id}
                        value={location.name}
                        onSelect={() => {
                          form.setValue("storage_location_id", location.id)
                          setStorageLocationSearchOpen(false)
                        }}
                      >
                        <div className="flex flex-col">
                          <span>{location.name}</span>
                          {location.description && (
                            <span className="text-muted-foreground text-xs">
                              {location.description}
                            </span>
                          )}
                        </div>
                      </CommandItem>
                    ),
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Storage Notes */}
      {form.watch("storage_location_id") && (
        <div className="space-y-2">
          <Label htmlFor="storage_notes">Storage Notes</Label>
          <Textarea
            id="storage_notes"
            placeholder="Notes about the storage location or conditions..."
            {...form.register("storage_notes")}
          />
        </div>
      )}

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
          Update Batch
        </Button>
      </div>
    </form>
  )
}
