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

import {
  useContainers,
  type CollectionContainerInput,
} from "@/hooks/useContainers"

type CollectionContainersFieldProps = {
  value: CollectionContainerInput[]
  onChange: (value: CollectionContainerInput[]) => void
  label?: string
}

export const CollectionContainersField = ({
  value,
  onChange,
  label = "Containers",
}: CollectionContainersFieldProps) => {
  const { data: containers } = useContainers()

  const selectedIds = value.map((row) => row.container_id)

  // Inactive containers remain selectable only where already chosen, so an
  // existing collection keeps showing what it was actually collected into.
  const options = useMemo(
    () =>
      containers?.filter(
        (container) =>
          (container.purpose === "collection" && container.active) ||
          selectedIds.includes(container.id),
      ) ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [containers, selectedIds.join(",")],
  )

  const hasUnusedOption = options.some(
    (container) => !selectedIds.includes(container.id),
  )

  const updateRow = (
    index: number,
    changes: Partial<CollectionContainerInput>,
  ) =>
    onChange(
      value.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...changes } : row,
      ),
    )

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {value.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {options.length === 0
            ? "No collection containers have been set up for your organisation yet."
            : "Add the containers this seed was collected into."}
        </p>
      )}

      {value.map((row, index) => (
        <div key={`${row.container_id}-${index}`} className="flex gap-2">
          <Select
            value={row.container_id || undefined}
            onValueChange={(containerId) =>
              updateRow(index, { container_id: containerId })
            }
          >
            {/* The trigger sets its own height through a data-size variant,
                which a plain h-* class loses to — match the Input's h-12 on
                the same variant instead. */}
            <SelectTrigger className="flex-1 text-lg data-[size=default]:h-12">
              <SelectValue placeholder="Select a container" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((container) => (
                  <SelectItem
                    key={container.id}
                    value={container.id}
                    disabled={
                      container.id !== row.container_id &&
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
          <Input
            className="h-12 w-24 text-lg"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            placeholder="Amount"
            aria-label="Amount"
            autoComplete="off"
            value={row.amount ?? ""}
            onChange={(e) =>
              updateRow(index, {
                amount: e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <Button
            type="button"
            variant="outline"
            className="h-12"
            aria-label="Remove container"
            onClick={() =>
              onChange(value.filter((_, rowIndex) => rowIndex !== index))
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        className="h-12 w-full gap-2"
        disabled={!hasUnusedOption}
        onClick={() => onChange([...value, { container_id: "", amount: null }])}
      >
        <Plus className="h-4 w-4" />
        Add Container
      </Button>
    </div>
  )
}
