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
import type { Batch, StorageLocation } from "@nasti/common/types"
import { cn } from "@nasti/ui/utils"

// Generate unique IDs for form management
const generateId = () => Math.random().toString(36).slice(2, 11)

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
    .min(2, "Must have at least 2 children")
    .max(5, "Maximum 5 children allowed"),
})

type BatchSplitFormData = z.infer<typeof batchSplitSchema>

type BatchSplitFormProps = {
  parentBatch: Batch
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

  // Fetch data
  const { data: storageLocations } = useStorageLocations()
  const { data: currentBatchStorage } = useCurrentBatchStorage(parentBatch.id)

  // Form setup with initial 2 children
  const form = useForm<BatchSplitFormData>({
    resolver: zodResolver(batchSplitSchema),
    defaultValues: {
      children: [
        {
          id: generateId(),
          weight_grams: parentBatch.weight_grams,
          storage_location_id: "",
        },
        {
          id: generateId(),
          weight_grams: 0,
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
  const isValidTotal = totalWeight === parentBatch.weight_grams
  const remainingWeight = parentBatch.weight_grams - totalWeight

  // Weight redistribution logic
  const updateChildWeight = (index: number, newWeight: number) => {
    const currentChildren = form.getValues("children")

    if (index === 0) {
      // When first child changes, distribute remaining weight proportionally among others
      const remainingForOthers = parentBatch.weight_grams - newWeight
      const otherChildren = currentChildren.slice(1)
      const otherChildrenTotal = otherChildren.reduce(
        (sum, child) => sum + Number(child.weight_grams),
        0,
      )

      if (otherChildrenTotal > 0 && remainingForOthers >= 0) {
        // Proportionally redistribute
        otherChildren.forEach((child, otherIndex) => {
          const proportion = Number(child.weight_grams) / otherChildrenTotal
          const newOtherWeight = Math.round(remainingForOthers * proportion)
          form.setValue(
            `children.${otherIndex + 1}.weight_grams`,
            Math.max(0, newOtherWeight),
          )
        })
      } else if (remainingForOthers >= 0) {
        // Equal distribution among other children
        const perChild = Math.floor(remainingForOthers / otherChildren.length)
        const remainder = remainingForOthers % otherChildren.length

        otherChildren.forEach((_, otherIndex) => {
          const additionalWeight = otherIndex < remainder ? 1 : 0
          form.setValue(
            `children.${otherIndex + 1}.weight_grams`,
            perChild + additionalWeight,
          )
        })
      }
    } else {
      // When any other child changes, update first child to balance
      const otherChildrenSum = currentChildren
        .slice(1)
        .reduce((sum, child, childIndex) => {
          return (
            sum +
            (childIndex === index - 1 ? newWeight : Number(child.weight_grams))
          )
        }, 0)

      const newFirstWeight = parentBatch.weight_grams - otherChildrenSum
      if (newFirstWeight >= 0) {
        form.setValue("children.0.weight_grams", newFirstWeight)
      }
    }
  }

  // Add new child
  const addChild = () => {
    if (fields.length < 5) {
      const newChild = {
        id: generateId(),
        weight_grams: 0,
        storage_location_id: currentBatchStorage?.location_id || "",
      }
      append(newChild)
    }
  }

  // Remove child and redistribute weight
  const removeChild = (index: number) => {
    if (fields.length > 2) {
      const removedWeight = form.getValues(`children.${index}.weight_grams`)
      remove(index)

      // Add removed weight to first child
      setTimeout(() => {
        const firstChildWeight = form.getValues("children.0.weight_grams")
        form.setValue(
          "children.0.weight_grams",
          firstChildWeight + removedWeight,
        )
      }, 0)
    }
  }

  // Handle form submission
  const onSubmit = async (data: BatchSplitFormData) => {
    if (!isValidTotal) {
      toast({
        description: "Total weight must equal parent batch weight",
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
          notes: `Split ${i + 1} of ${weightedChildren.length} from batch ${parentBatch.id.slice(0, 8)}`,
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
        <p className="text-muted-foreground text-sm">
          Parent Weight: {parentBatch.weight_grams}g → Split into{" "}
          {fields.length} children
        </p>
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
                  disabled={fields.length <= 2}
                  className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max={parentBatch.weight_grams}
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
                          parentBatch.weight_grams) *
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
        className={`text-primary p-4 ${isValidTotal ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium">
              Total Weight: {totalWeight}g / {parentBatch.weight_grams}g
            </p>
            {remainingWeight !== 0 && (
              <p className="text-sm">
                {remainingWeight > 0 ? "Remaining" : "Excess"}:{" "}
                {Math.abs(remainingWeight)}g
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isValidTotal ? (
              <span className="text-sm font-medium text-green-700">
                ✓ Weights match
              </span>
            ) : (
              <span className="text-sm font-medium text-red-700">
                ⚠ Weight mismatch
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
