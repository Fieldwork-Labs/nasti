import { zodResolver } from "@hookform/resolvers/zod"
import {
  CONTAINER_PURPOSES,
  CONTAINER_PURPOSE_LABELS,
  type Container,
} from "@nasti/common/types"
import { useCallback, useMemo } from "react"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@nasti/ui/button"
import { FormField } from "@nasti/ui/formField"
import { useToast } from "@nasti/ui/hooks"
import { Label } from "@nasti/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { Switch } from "@nasti/ui/switch"
import { cn } from "@nasti/ui/utils"

import { useCreateContainer, useUpdateContainer } from "@/hooks/useContainers"

const schema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .trim(),
  purpose: z.enum(CONTAINER_PURPOSES, {
    required_error: "Purpose is required",
  }),
  active: z.boolean(),
})

type ContainerFormData = z.infer<typeof schema>

type ContainerFormProps = {
  instance?: Container
  onSuccess?: (container: Container) => void
  onCancel?: () => void
  className?: string
}

export const ContainerForm = ({
  instance,
  onSuccess,
  onCancel,
  className,
}: ContainerFormProps) => {
  const { toast } = useToast()

  const createContainer = useCreateContainer()
  const updateContainer = useUpdateContainer()

  const defaultValues = useMemo<Partial<ContainerFormData>>(
    () =>
      instance
        ? {
            name: instance.name,
            purpose: instance.purpose,
            active: instance.active,
          }
        : { name: "", purpose: undefined, active: true },
    [instance],
  )

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting, isValid, isDirty },
  } = useForm<ContainerFormData>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues,
  })

  const onSubmit = useCallback(
    async (data: ContainerFormData) => {
      try {
        if (instance) {
          if (!isDirty) {
            onSuccess?.(instance)
            return
          }

          onSuccess?.(
            await updateContainer.mutateAsync({ id: instance.id, ...data }),
          )
        } else {
          onSuccess?.(await createContainer.mutateAsync(data))
        }
      } catch (error) {
        toast({
          variant: "destructive",
          description:
            error instanceof Error ? error.message : "Failed to save container",
        })
      }
    },
    [instance, isDirty, updateContainer, createContainer, onSuccess, toast],
  )

  const isLoading =
    isSubmitting || createContainer.isPending || updateContainer.isPending

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={cn("flex flex-col gap-4", className)}
    >
      <FormField
        label="Name"
        type="text"
        placeholder="e.g. Large bucket"
        {...register("name")}
        error={errors.name}
        disabled={isLoading}
        autoComplete="off"
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="purpose">Purpose</Label>
        <Controller
          control={control}
          name="purpose"
          render={({ field }) => (
            <Select
              onValueChange={field.onChange}
              value={field.value}
              disabled={isLoading}
            >
              <SelectTrigger
                id="purpose"
                className="w-full data-[size=default]:h-10"
                onBlur={field.onBlur}
              >
                <SelectValue placeholder="Select a purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CONTAINER_PURPOSES.map((purpose) => (
                    <SelectItem key={purpose} value={purpose}>
                      {CONTAINER_PURPOSE_LABELS[purpose]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        />
        {errors.purpose && (
          <div className="flex h-4 justify-end text-xs text-orange-800">
            {errors.purpose.message}
          </div>
        )}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <Label htmlFor="active">Active</Label>
          <span className="text-muted-foreground text-sm">
            Inactive containers stay on existing records but cannot be added to
            new ones.
          </span>
        </div>
        <Controller
          control={control}
          name="active"
          render={({ field }) => (
            <Switch
              id="active"
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={isLoading}
            />
          )}
        />
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
          disabled={!isValid || isLoading || !isDirty}
        >
          {isLoading
            ? instance
              ? "Updating..."
              : "Creating..."
            : instance
              ? "Update Container"
              : "Create Container"}
        </Button>
      </div>
    </form>
  )
}

export { schema as containerFormSchema }
export type { ContainerFormData }
