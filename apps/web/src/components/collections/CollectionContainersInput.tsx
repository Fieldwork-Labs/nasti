import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { Controller, useFieldArray, type UseFormReturn } from "react-hook-form"

import { useContainers } from "@/hooks/useContainers"
import type { CollectionFormData } from "./CollectionFormContext"

type CollectionContainersInputProps = {
  form: UseFormReturn<CollectionFormData>
}

export const CollectionContainersInput = ({
  form,
}: CollectionContainersInputProps) => {
  const {
    control,
    formState: { errors },
    watch,
  } = form

  const { data: containers } = useContainers()
  const { fields, append, remove } = useFieldArray({
    control,
    name: "containers",
  })

  const selected = watch("containers")
  const selectedIds = useMemo(
    () => (selected ?? []).map((row) => row.container_id),
    [selected],
  )

  // Retired containers stay visible on the collections that already reference
  // them; only active collection containers can be added to a collection.
  const options = useMemo(
    () =>
      containers?.filter(
        (container) =>
          (container.purpose === "collection" && container.active) ||
          selectedIds.includes(container.id),
      ) ?? [],
    [containers, selectedIds],
  )

  const hasUnusedOption = options.some(
    (container) => !selectedIds.includes(container.id),
  )

  return (
    <div className="space-y-2">
      <Label>Containers</Label>
      {fields.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {options.length === 0
            ? "No collection containers have been set up for your organisation yet."
            : "Add the containers this seed was collected into."}
        </p>
      )}

      <div className="space-y-2">
        {fields.map((field, index) => {
          const rowErrors = errors.containers?.[index]
          return (
            <div key={field.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <Controller
                  control={control}
                  name={`containers.${index}.container_id`}
                  render={({ field: containerField }) => (
                    <Select
                      value={containerField.value || undefined}
                      onValueChange={containerField.onChange}
                    >
                      {/* The trigger sets its own height through a data-size
                          variant, which a plain h-* class loses to — match
                          Input's h-10 on the same variant instead. */}
                      <SelectTrigger
                        className="flex-1 data-[size=default]:h-10"
                        onBlur={containerField.onBlur}
                      >
                        <SelectValue placeholder="Select a container" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {options.map((container) => (
                            <SelectItem
                              key={container.id}
                              value={container.id}
                              disabled={
                                container.id !== containerField.value &&
                                selectedIds.includes(container.id)
                              }
                            >
                              {container.name}
                              {!container.active && " (inactive)"}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <Controller
                  control={control}
                  name={`containers.${index}.amount`}
                  render={({ field: amountField }) => (
                    <Input
                      className="w-24"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="Amount"
                      aria-label="Amount"
                      value={amountField.value ?? ""}
                      onBlur={amountField.onBlur}
                      onChange={(e) => amountField.onChange(e.target.value)}
                    />
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove container"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {rowErrors && (
                <div className="text-xs text-orange-800">
                  {rowErrors.container_id?.message ?? rowErrors.amount?.message}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        disabled={!hasUnusedOption}
        onClick={() => append({ container_id: "", amount: null })}
      >
        <Plus className="h-4 w-4" />
        Add Container
      </Button>
    </div>
  )
}
