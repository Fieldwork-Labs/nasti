import { type StorageLocation } from "@nasti/common/types"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useMemo } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"

import useUserStore from "@/store/userStore"
import {
  useCreateStorageLocation,
  useUpdateStorageLocation,
} from "../../hooks/useBatchStorage"

type StorageLocationFormData = {
  name: string
  description: string
}

const schema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  description: z
    .string()
    .max(500, "Description must be less than 500 characters"),
})

type StorageLocationFormProps = {
  instance?: StorageLocation
  onSuccess?: (location: StorageLocation) => void
  onCancel?: () => void
  className?: string
}

export const StorageLocationForm = ({
  instance,
  onSuccess,
  onCancel,
  className,
}: StorageLocationFormProps) => {
  const { organisation } = useUserStore()
  const { toast } = useToast()

  const createStorageLocation = useCreateStorageLocation()
  const updateStorageLocation = useUpdateStorageLocation()

  const defaultValues = useMemo(() => {
    return instance
      ? {
          name: instance.name,
          description: instance.description ?? "",
        }
      : {
          name: "",
          description: "",
        }
  }, [instance])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isValid, isDirty },
  } = useForm<StorageLocationFormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues,
  })

  const onSubmit = useCallback(
    async (data: StorageLocationFormData) => {
      try {
        if (!organisation?.id) {
          throw new Error("No organisation found")
        }

        let result: StorageLocation

        if (instance) {
          // Update existing location
          if (!isDirty) {
            onSuccess?.(instance)
            return
          }

          result = await updateStorageLocation.mutateAsync({
            id: instance.id,
            name: data.name,
            description: data.description || undefined,
          })

          toast({
            description: "Storage location updated successfully",
          })
        } else {
          // Create new location
          result = await createStorageLocation.mutateAsync({
            name: data.name,
            description: data.description || undefined,
          })

          toast({
            description: "Storage location created successfully",
          })
        }

        onSuccess?.(result)
      } catch (error) {
        toast({
          variant: "destructive",
          description:
            error instanceof Error
              ? error.message
              : "Failed to save storage location",
        })
      }
    },
    [
      organisation?.id,
      instance,
      isDirty,
      updateStorageLocation,
      createStorageLocation,
      onSuccess,
      toast,
    ],
  )

  const isLoading =
    isSubmitting ||
    createStorageLocation.isPending ||
    updateStorageLocation.isPending

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="space-y-4">
        <FormField
          label="Name"
          type="text"
          placeholder="e.g., Cold Storage Room A"
          {...register("name")}
          error={errors.name}
          disabled={isLoading}
          autoComplete="off"
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Optional description of the storage location..."
            rows={3}
            {...register("description")}
            disabled={isLoading}
            className={cn(
              errors.description &&
                "border-orange-800 focus:border-orange-500 focus:ring-orange-600",
            )}
          />
          {errors.description && (
            <div className="flex h-4 justify-end text-xs text-orange-800">
              {errors.description.message}
            </div>
          )}
          {!errors.description && <span className="h-4" />}
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          className="flex-1"
          disabled={!isValid || isLoading || (!instance && !isDirty)}
        >
          {isLoading
            ? instance
              ? "Updating..."
              : "Creating..."
            : instance
              ? "Update Location"
              : "Create Location"}
        </Button>
      </div>
    </form>
  )
}

// Export the schema for potential reuse
export { schema as storageLocationFormSchema }
export type { StorageLocationFormData }
