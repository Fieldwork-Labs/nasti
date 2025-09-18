import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { Checkbox } from "@nasti/ui/checkbox"
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
  CollectionWithSpeciesAndTrip,
  useCollections,
} from "@/hooks/useCollections"
import {
  useStorageLocations,
  useCurrentBatchStorage,
  useUpdateStorageRecord,
  useCreateStorageRecord,
} from "@/hooks/useBatchStorage"
import {
  useUpdateBatch,
  useCreateBatchFromCollection,
} from "@/hooks/useBatches"
import { useMoveBatchToStorage } from "@/hooks/useBatchStorage"
import type { Batch, StorageLocation } from "@nasti/common/types"

const batchFormSchema = z.object({
  collection_id: z.string().min(1, "Collection is required"),
  weight_grams: z.coerce
    .number()
    .int()
    .min(1, "Weight must be at least 1 gram"),
  is_extracted: z.boolean().default(false),
  is_treated: z.boolean().default(false),
  is_sorted: z.boolean().default(false),
  is_coated: z.boolean().default(false),
  notes: z.string().optional(),
  storage_location_id: z.string().optional(),
  storage_notes: z.string().optional(),
})

type BatchFormData = z.infer<typeof batchFormSchema>

const CollectionDisplay = ({
  collection,
}: {
  collection: CollectionWithSpeciesAndTrip
}) => {
  return (
    <span className="truncate">
      {collection.field_name ||
        collection.species?.name ||
        `Collection ${collection.id.slice(0, 8)}`}{" "}
      - {collection.trip.name}
    </span>
  )
}

type BatchFormProps = {
  batch?: Batch
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
  const [collectionSearchOpen, setCollectionSearchOpen] = useState(false)
  const [storageLocationSearchOpen, setStorageLocationSearchOpen] =
    useState(false)
  const [collectionSearchTerm, setCollectionSearchTerm] = useState("")
  const [storageLocationSearchTerm, setStorageLocationSearchTerm] = useState("")

  // Hooks for data fetching
  const { data: collections } = useCollections({
    page: 0, // Start from page 0
    limit: 100, // Get enough collections for the dropdown
    searchTerm: collectionSearchTerm || undefined, // Use search term for filtering
  })
  const { data: storageLocations } = useStorageLocations()
  const { data: currentBatchStorage } = useCurrentBatchStorage(batch?.id || "")

  // Mutations
  const createBatchMutation = useCreateBatchFromCollection()
  const updateBatchMutation = useUpdateBatch()
  const moveBatchToStorageMutation = useMoveBatchToStorage()
  const createStorage = useCreateStorageRecord()
  const updateStorage = useUpdateStorageRecord()

  // Form setup
  const form = useForm<BatchFormData>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      collection_id: batch?.collection_id || "",
      weight_grams: batch?.weight_grams || 0,
      is_extracted: batch?.is_extracted || false,
      is_treated: batch?.is_treated || false,
      is_sorted: batch?.is_sorted || false,
      is_coated: batch?.is_coated || false,
      notes: batch?.notes || "",
      storage_location_id: "",
      storage_notes: "",
    },
  })

  // Reset form values when batch or currentBatchStorage data changes
  useEffect(() => {
    if (batch) {
      form.reset({
        collection_id: batch.collection_id,
        weight_grams: batch.weight_grams,
        is_extracted: batch.is_extracted,
        is_treated: batch.is_treated,
        is_sorted: batch.is_sorted,
        is_coated: batch.is_coated,
        notes: batch.notes || "",
        storage_location_id: currentBatchStorage?.location_id || "",
        storage_notes: currentBatchStorage?.notes || "",
      })
    }
  }, [batch, currentBatchStorage, form])

  // Filter storage locations (collections are filtered server-side by the hook)
  const filteredStorageLocations = storageLocations?.filter(
    (location: StorageLocation) =>
      location.name
        .toLowerCase()
        .includes(storageLocationSearchTerm.toLowerCase()) ||
      location.description
        ?.toLowerCase()
        .includes(storageLocationSearchTerm.toLowerCase()),
  )

  // Get selected items
  const selectedCollection = collections?.find(
    (c: CollectionWithSpeciesAndTrip) => c.id === form.watch("collection_id"),
  )
  const selectedStorageLocation = storageLocations?.find(
    (l: StorageLocation) => l.id === form.watch("storage_location_id"),
  )

  const isLoading =
    createBatchMutation.isPending ||
    updateBatchMutation.isPending ||
    moveBatchToStorageMutation.isPending
  const isEditing = Boolean(batch)

  const onSubmit = async (data: BatchFormData) => {
    try {
      if (isEditing) {
        // Update existing batch with all fields
        await updateBatchMutation.mutateAsync({
          id: batch!.id,
          weight_grams: data.weight_grams,
          is_extracted: data.is_extracted,
          is_treated: data.is_treated,
          is_sorted: data.is_sorted,
          is_coated: data.is_coated,
          notes: data.notes,
        })
        if (currentBatchStorage) {
          await updateStorage.mutateAsync({
            locationId: data.storage_location_id,
            notes: data.storage_notes,
            storageId: currentBatchStorage.id,
          })
        }

        toast({
          description: "Batch updated successfully",
        })
      } else {
        // Create new batch from collection with all fields in one operation
        batch = await createBatchMutation.mutateAsync({
          collectionId: data.collection_id,
          weight_grams: data.weight_grams,
          is_extracted: data.is_extracted,
          is_treated: data.is_treated,
          is_sorted: data.is_sorted,
          is_coated: data.is_coated,
          notes: data.notes,
        })
        if (data.storage_location_id) {
          await createStorage.mutateAsync({
            locationId: data.storage_location_id,
            batchId: batch.id,
            notes: data.storage_notes,
          })
        }

        toast({
          description: "Batch created successfully",
        })
      }

      onSuccess?.()
    } catch (error) {
      toast({
        description: `Failed to ${isEditing ? "update" : "create"} batch`,
        variant: "destructive",
      })
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={`space-y-6 ${className}`}
    >
      {/* Collection Selection */}
      <div className="space-y-2">
        <Label htmlFor="collection">Collection *</Label>
        <Popover
          open={collectionSearchOpen}
          onOpenChange={setCollectionSearchOpen}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="w-full justify-start"
              disabled={isEditing} // Can't change collection for existing batch
            >
              {selectedCollection ? (
                <span className="truncate">
                  <CollectionDisplay collection={selectedCollection} />
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Select collection...
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command>
              <CommandInput
                placeholder="Search collections..."
                value={collectionSearchTerm}
                onValueChange={setCollectionSearchTerm}
              />
              <CommandList>
                <CommandEmpty>No collections found.</CommandEmpty>
                <CommandGroup>
                  {collections?.map(
                    (collection: CollectionWithSpeciesAndTrip) => (
                      <CommandItem
                        key={collection.id}
                        value={collection.id}
                        onSelect={() => {
                          form.setValue("collection_id", collection.id)
                          setCollectionSearchOpen(false)
                        }}
                      >
                        <div className="flex flex-col">
                          <CollectionDisplay collection={collection} />
                        </div>
                      </CommandItem>
                    ),
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.formState.errors.collection_id && (
          <p className="text-sm text-red-600">
            {form.formState.errors.collection_id.message}
          </p>
        )}
      </div>

      {/* Weight */}
      <div className="space-y-2">
        <Label htmlFor="weight">Weight (grams) *</Label>
        <Input
          id="weight"
          type="number"
          min="1"
          placeholder="Enter weight in grams"
          {...form.register("weight_grams")}
        />
        {form.formState.errors.weight_grams && (
          <p className="text-sm text-red-600">
            {form.formState.errors.weight_grams.message}
          </p>
        )}
      </div>

      {/* Processing Status Checkboxes */}
      <div className="space-y-4">
        <Label>Processing Status</Label>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_extracted"
              checked={form.watch("is_extracted")}
              onCheckedChange={(checked) =>
                form.setValue("is_extracted", Boolean(checked))
              }
            />
            <Label htmlFor="is_extracted" className="text-sm font-normal">
              Extracted
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_treated"
              checked={form.watch("is_treated")}
              onCheckedChange={(checked) =>
                form.setValue("is_treated", Boolean(checked))
              }
            />
            <Label htmlFor="is_treated" className="text-sm font-normal">
              Treated
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_sorted"
              checked={form.watch("is_sorted")}
              onCheckedChange={(checked) =>
                form.setValue("is_sorted", Boolean(checked))
              }
            />
            <Label htmlFor="is_sorted" className="text-sm font-normal">
              Sorted
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_coated"
              checked={form.watch("is_coated")}
              onCheckedChange={(checked) =>
                form.setValue("is_coated", Boolean(checked))
              }
            />
            <Label htmlFor="is_coated" className="text-sm font-normal">
              Coated
            </Label>
          </div>
        </div>
      </div>

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
            >
              {selectedStorageLocation ? (
                <span className="truncate">{selectedStorageLocation.name}</span>
              ) : (
                <span className="text-muted-foreground">
                  Select storage location...
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command>
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
          {isEditing ? "Update Batch" : "Create Batch"}
        </Button>
      </div>
    </form>
  )
}
