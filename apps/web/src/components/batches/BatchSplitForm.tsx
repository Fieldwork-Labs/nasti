import {
  useForm,
  useFieldArray,
  FormProvider,
  useFormContext,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect } from "react"
import { Loader2, Plus, X, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Card } from "@nasti/ui/card"
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

import { useSplitBatch } from "@/hooks/useBatches"
import {
  useStorageLocations,
  useCurrentBatchStorage,
  useCreateStorageRecord,
} from "@/hooks/useBatchStorage"
import type { StorageLocation } from "@nasti/common/types"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"
import { cn } from "@nasti/ui/utils"

// Child Storage Location Selector Component
type ChildStorageLocationSelectorProps = {
  index: number
  storageLocations: StorageLocation[] | undefined
}

const ChildStorageLocationSelector = ({
  index,
  storageLocations,
}: ChildStorageLocationSelectorProps) => {
  const { watch, setValue } = useFormContext()
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  const filteredLocations = storageLocations?.filter(
    (location) =>
      location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const selectedLocation = storageLocations?.find(
    (l) => l.id === watch(`children.${index}.storage_location_id`),
  )

  return (
    <Popover open={searchOpen} onOpenChange={setSearchOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="h-8 w-full justify-start text-xs"
          size="sm"
        >
          {selectedLocation ? (
            <span className="truncate">{selectedLocation.name}</span>
          ) : (
            <span className="text-muted-foreground">Select location...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput
            placeholder="Search locations..."
            value={searchTerm}
            onValueChange={setSearchTerm}
          />
          <CommandList>
            <CommandEmpty>No locations found.</CommandEmpty>
            <CommandGroup>
              {watch(`children.${index}.storage_location_id`) && (
                <CommandItem
                  value="none"
                  onSelect={() => {
                    setValue(`children.${index}.storage_location_id`, "")
                    setSearchOpen(false)
                  }}
                >
                  <span className="text-muted-foreground text-xs">
                    No location
                  </span>
                </CommandItem>
              )}
              {filteredLocations?.map((location) => (
                <CommandItem
                  key={location.id}
                  value={location.name}
                  onSelect={() => {
                    setValue(
                      `children.${index}.storage_location_id`,
                      location.id,
                    )
                    setSearchOpen(false)
                  }}
                >
                  <div className="flex flex-col">
                    <span className="text-xs">{location.name}</span>
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
  )
}

const batchSplitSchema = z.object({
  children: z
    .array(
      z.object({
        id: z.string(),
        weight_grams: z.coerce
          .number()
          .min(1, "Weight must be at least 1 gram"),
        storage_location_id: z.string().optional(),
      }),
    )
    .min(1, "Must have at least 1 children")
    .max(5, "Maximum 5 children allowed"),
})

type BatchSplitFormData = z.infer<typeof batchSplitSchema>

type BatchSplitFormProps = {
  parentBatch: BatchWithCurrentLocationAndSpecies
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const BatchSplitForm = ({
  parentBatch,
  onSuccess,
  onCancel,
  className,
}: BatchSplitFormProps) => {
  const { toast } = useToast()
  const splitBatchMutation = useSplitBatch()
  const createStorage = useCreateStorageRecord()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Get current weight (use weight_info if available, otherwise original weight)
  const currentWeight =
    parentBatch.weights?.current_weight ?? parentBatch.weight_grams
  const originalWeight =
    parentBatch.weights?.original_weight ?? parentBatch.weight_grams

  // Fetch data
  const { data: storageLocations } = useStorageLocations()
  const { data: currentBatchStorage } = useCurrentBatchStorage(parentBatch.id)

  // Form setup with initial 2 children (default to splitting current weight in half)
  const form = useForm<BatchSplitFormData>({
    resolver: zodResolver(batchSplitSchema),
    defaultValues: {
      children: [
        {
          id: crypto.randomUUID(),
          weight_grams: Math.floor((currentWeight ?? 0) / 2),
          storage_location_id: "",
        },
        {
          id: crypto.randomUUID(),
          weight_grams: Math.ceil((currentWeight ?? 0) / 2),
          storage_location_id: "",
        },
      ],
    },
  })

  // Auto-populate storage location from parent batch for all children
  useEffect(() => {
    if (currentBatchStorage) {
      const currentChildren = form.getValues("children")
      currentChildren.forEach((_, index) => {
        form.setValue(
          `children.${index}.storage_location_id`,
          currentBatchStorage.location_id,
        )
      })
    }
  }, [currentBatchStorage, form])

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "children",
  })

  // Calculate totals and validation
  const watchedChildren = form.watch("children")
  const totalWeight = watchedChildren.reduce(
    (sum, child) => sum + (Number(child.weight_grams) || 0),
    0,
  )
  // Allow partial splits - total can be <= current weight
  const isValidTotal = currentWeight
    ? totalWeight > 0 && totalWeight <= currentWeight
    : true
  const remainingWeight = currentWeight ? currentWeight - totalWeight : 0

  // Weight redistribution logic (no longer auto-balancing to allow partial splits)
  const updateChildWeight = (_index: number, _newWeight: number) => {
    // Remove auto-balancing logic to allow flexible partial splits
    // Users can manually adjust weights as needed
  }

  // Add new child
  const addChild = () => {
    if (fields.length < 5) {
      const newChild = {
        id: crypto.randomUUID(),
        weight_grams: 0,
        storage_location_id: currentBatchStorage?.location_id || "",
      }
      append(newChild)
    }
  }

  // Remove child (no weight redistribution for partial splits)
  const removeChild = (index: number) => {
    if (fields.length > 1) remove(index)
  }

  // Handle form submission
  const onSubmit = async (data: BatchSplitFormData) => {
    if (!isValidTotal) {
      toast({
        description:
          currentWeight && totalWeight > currentWeight
            ? `Total weight (${totalWeight}g) exceeds current batch weight (${currentWeight}g)`
            : "Total weight must be greater than 0",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)
    const createdBatches: string[] = []

    try {
      // filter out child batches with 0 weight
      const weightedChildren = data.children.filter(
        (child) => child.weight_grams > 0,
      )

      // Create child batches sequentially
      for (let i = 0; i < weightedChildren.length; i++) {
        const child = weightedChildren[i]

        const childBatchId = await splitBatchMutation.mutateAsync({
          parentBatchId: parentBatch.id,
          weight_grams: child.weight_grams,
          notes: `Split ${i + 1} of ${weightedChildren.length} from batch ${parentBatch.code}`,
        })
        createdBatches.push(childBatchId)

        // Create storage record for child batch if storage location is specified
        if (child.storage_location_id) {
          await createStorage.mutateAsync({
            locationId: child.storage_location_id,
            batchId: childBatchId,
          })
        }
      }

      const storageAssignedCount = weightedChildren.filter(
        (child) => child.storage_location_id,
      ).length
      toast({
        description: `Successfully split batch into ${weightedChildren.length} children${
          storageAssignedCount > 0
            ? ` (${storageAssignedCount} assigned to storage)`
            : ""
        }`,
      })

      onSuccess?.()
    } catch (error) {
      console.error("Split failed:", error)
      toast({
        description: `Failed to split batch${createdBatches.length > 0 ? ` (${createdBatches.length} children created)` : ""}`,
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className={cn("space-y-6", className)}
    >
      {/* Header Info */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold">
            Split Batch {parentBatch.id.slice(0, 8)}...
          </h3>
        </div>
        <div className="text-muted-foreground space-y-1 text-sm">
          <p>Current Weight: {currentWeight}g</p>
          {currentWeight !== originalWeight && (
            <p className="text-xs">Original Weight: {originalWeight}g</p>
          )}
          <p>
            Splitting into {fields.length}{" "}
            {fields.length === 1 ? "child" : "children"}
          </p>
        </div>
      </div>

      {/* Child Batch Fieldsets */}
      <div className="space-y-4">
        <FormProvider {...form}>
          {fields.map((field, index) => (
            <Card key={field.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Child Batch {index + 1}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeChild(index)}
                  disabled={fields.length <= 1}
                  className="h-8 w-8 cursor-pointer p-0 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max={currentWeight ?? 0}
                    placeholder="Weight in grams"
                    {...form.register(`children.${index}.weight_grams`, {
                      onChange: (e) =>
                        updateChildWeight(index, parseInt(e.target.value) || 0),
                    })}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground min-w-[20px] text-sm">
                    g
                  </span>
                </div>

                {/* Weight Bar Visualization */}
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-2 rounded-full transition-all duration-200 ${
                      (Number(watchedChildren[index]?.weight_grams) || 0) > 0
                        ? "bg-blue-500"
                        : "bg-gray-300"
                    }`}
                    style={{
                      width: `${Math.min(
                        ((Number(watchedChildren[index]?.weight_grams) || 0) /
                          (currentWeight ?? 1)) *
                          100,
                        100,
                      )}%`,
                    }}
                  />
                </div>

                {/* Storage Location Selector */}
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-xs">
                    Storage Location
                  </Label>
                  <ChildStorageLocationSelector
                    index={index}
                    storageLocations={storageLocations}
                  />
                </div>

                {form.formState.errors.children?.[index]?.weight_grams && (
                  <p className="text-sm text-red-600">
                    {
                      form.formState.errors.children[index]?.weight_grams
                        ?.message
                    }
                  </p>
                )}
              </div>
            </Card>
          ))}
        </FormProvider>
      </div>

      {/* Add Child Button */}
      <Button
        type="button"
        variant="outline"
        onClick={addChild}
        disabled={fields.length >= 5}
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Child Batch ({fields.length}/5)
      </Button>

      {/* Weight Summary */}
      <Card
        className={`text-primary p-4 ${
          isValidTotal
            ? remainingWeight > 0
              ? "border-blue-200 bg-blue-50"
              : "border-green-200 bg-green-50"
            : "border-red-200 bg-red-50"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Total Children Weight: {totalWeight}g / {currentWeight}g
            </p>
            {remainingWeight > 0 && isValidTotal && (
              <p className="text-muted-foreground text-xs">
                {remainingWeight}g will remain in parent batch
              </p>
            )}
            {remainingWeight < 0 && (
              <p className="text-sm text-red-700">
                Excess: {Math.abs(remainingWeight)}g
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isValidTotal ? (
              remainingWeight > 0 ? (
                <span className="text-sm font-medium text-blue-700">
                  ✓ Partial split
                </span>
              ) : (
                <span className="text-sm font-medium text-green-700">
                  ✓ Full split
                </span>
              )
            ) : (
              <span className="text-sm font-medium text-red-700">
                ⚠ Invalid weight
              </span>
            )}
          </div>
        </div>
      </Card>

      {form.formState.errors.children && (
        <p className="text-sm text-red-600">
          {form.formState.errors.children.message}
        </p>
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
          disabled={isSubmitting || !isValidTotal}
          className="min-w-[120px] cursor-pointer"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Split Batch
        </Button>
      </div>
    </form>
  )
}
