import { useState, type FormEvent } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { useToast } from "@nasti/ui/hooks"

import { useActiveContainers } from "@/hooks/useContainers"
import {
  type BatchCleaningWithOutputs,
  useBagAndStoreCleaningOutputs,
} from "@/hooks/useCleanBatch"
import { useActiveStorageLocations } from "@/hooks/useStorageLocations"

const NO_LOCATION = "__none__"

type ContainerGroupDraft = {
  key: string
  containerId: string
  locationId: string
  quantity: string
  weightGrams: string
}

type OutputDraft = {
  outputBatchId: string
  expectedWeightGrams: number
  groups: ContainerGroupDraft[]
}

type CleaningBaggingFormProps = {
  cleaning: BatchCleaningWithOutputs
  onSuccess?: () => void
  onCancel?: () => void
}

const createGroup = (weightGrams = ""): ContainerGroupDraft => ({
  key: crypto.randomUUID(),
  containerId: "",
  locationId: "",
  quantity: "1",
  weightGrams,
})

const getAllocatedWeight = (groups: ContainerGroupDraft[]) =>
  groups.reduce((total, group) => {
    const quantity = Number(group.quantity)
    const weight = Number(group.weightGrams)
    return (
      total +
      (Number.isFinite(quantity) ? quantity : 0) *
        (Number.isFinite(weight) ? weight : 0)
    )
  }, 0)

const formatWeight = (weight: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(weight)

export const CleaningBaggingForm = ({
  cleaning,
  onSuccess,
  onCancel,
}: CleaningBaggingFormProps) => {
  const { toast } = useToast()
  const { data: containers = [], isLoading: containersLoading } =
    useActiveContainers("storage")
  const { data: locations = [], isLoading: locationsLoading } =
    useActiveStorageLocations()
  const bagAndStore = useBagAndStoreCleaningOutputs()
  const [error, setError] = useState<string>()
  const [outputs, setOutputs] = useState<OutputDraft[]>(() =>
    cleaning.outputs.map((output) => ({
      outputBatchId: output.output_batch_id,
      expectedWeightGrams: output.weight_grams,
      groups: [createGroup(String(output.weight_grams))],
    })),
  )

  const updateGroup = (
    outputIndex: number,
    groupIndex: number,
    updates: Partial<ContainerGroupDraft>,
  ) => {
    setOutputs((current) =>
      current.map((output, currentOutputIndex) =>
        currentOutputIndex === outputIndex
          ? {
              ...output,
              groups: output.groups.map((group, currentGroupIndex) =>
                currentGroupIndex === groupIndex
                  ? { ...group, ...updates }
                  : group,
              ),
            }
          : output,
      ),
    )
    setError(undefined)
  }

  const addGroup = (outputIndex: number) => {
    setOutputs((current) =>
      current.map((output, currentOutputIndex) =>
        currentOutputIndex === outputIndex
          ? { ...output, groups: [...output.groups, createGroup()] }
          : output,
      ),
    )
  }

  const removeGroup = (outputIndex: number, groupIndex: number) => {
    setOutputs((current) =>
      current.map((output, currentOutputIndex) =>
        currentOutputIndex === outputIndex
          ? {
              ...output,
              groups: output.groups.filter(
                (_, currentGroupIndex) => currentGroupIndex !== groupIndex,
              ),
            }
          : output,
      ),
    )
    setError(undefined)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    for (const output of outputs) {
      if (output.groups.length === 0) {
        setError("Add at least one container group for every output batch.")
        return
      }

      for (const group of output.groups) {
        const quantity = Number(group.quantity)
        const weight = Number(group.weightGrams)
        if (!group.containerId) {
          setError("Select a container type for every row.")
          return
        }
        if (
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          !Number.isFinite(weight) ||
          weight <= 0
        ) {
          setError(
            "Container quantities must be whole numbers and weights must be greater than zero.",
          )
          return
        }
      }

      if (
        Math.abs(
          getAllocatedWeight(output.groups) - output.expectedWeightGrams,
        ) > 0.000001
      ) {
        setError(
          "The allocated container weights must equal each output batch weight.",
        )
        return
      }
    }

    try {
      await bagAndStore.mutateAsync({
        cleaningId: cleaning.id,
        outputs: outputs.map((output) => ({
          output_batch_id: output.outputBatchId,
          containers: output.groups.map((group) => ({
            container_id: group.containerId,
            ...(group.locationId && { location_id: group.locationId }),
            quantity: Number(group.quantity),
            weight_grams: Number(group.weightGrams),
          })),
        })),
      })
      toast({ description: "Cleaned batches bagged successfully" })
      onSuccess?.()
    } catch (submissionError) {
      console.error("Bagging and storage failed:", submissionError)
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Failed to bag and store cleaned batches.",
      )
    }
  }

  const isLoading = containersLoading
  const cannotSubmit =
    isLoading || bagAndStore.isPending || containers.length === 0

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <p className="text-muted-foreground text-sm">
        Record how each cleaning output is divided into physical containers.
        Each container will be tracked as a separate bag.
      </p>

      {!isLoading && containers.length === 0 && (
        <p className="text-destructive text-sm">
          Add an active storage container type in organisation settings before
          continuing.
        </p>
      )}
      {outputs.map((output, outputIndex) => {
        const sourceOutput = cleaning.outputs.find(
          (candidate) => candidate.output_batch_id === output.outputBatchId,
        )
        const allocatedWeight = getAllocatedWeight(output.groups)
        const remainingWeight = output.expectedWeightGrams - allocatedWeight

        return (
          <section
            key={output.outputBatchId}
            className="space-y-4 rounded-lg border p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">
                  {sourceOutput?.output_batch.code ?? "Output batch"}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {sourceOutput?.quality} ·{" "}
                  {formatWeight(output.expectedWeightGrams)} g total
                </p>
              </div>
              <p
                className={
                  Math.abs(remainingWeight) <= 0.000001
                    ? "text-muted-foreground text-sm"
                    : "text-destructive text-sm"
                }
              >
                {formatWeight(allocatedWeight)} g allocated
                {Math.abs(remainingWeight) > 0.000001 &&
                  ` · ${formatWeight(Math.abs(remainingWeight))} g ${
                    remainingWeight > 0 ? "remaining" : "over"
                  }`}
              </p>
            </div>

            <div className="space-y-3">
              {output.groups.map((group, groupIndex) => (
                <div
                  key={group.key}
                  className="bg-muted/40 grid gap-3 rounded-md p-3 md:grid-cols-[minmax(9rem,1fr)_minmax(9rem,1fr)_6rem_8rem_auto]"
                >
                  <div className="space-y-1.5">
                    <Label>Container type</Label>
                    <Select
                      value={group.containerId}
                      onValueChange={(containerId) =>
                        updateGroup(outputIndex, groupIndex, { containerId })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {containers.map((container) => (
                          <SelectItem key={container.id} value={container.id}>
                            {container.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Storage location (optional)</Label>
                    <Select
                      value={group.locationId || NO_LOCATION}
                      onValueChange={(locationId) =>
                        updateGroup(outputIndex, groupIndex, {
                          locationId:
                            locationId === NO_LOCATION ? "" : locationId,
                        })
                      }
                      disabled={locationsLoading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="No location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LOCATION}>No location</SelectItem>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${group.key}-quantity`}>Number</Label>
                    <Input
                      id={`${group.key}-quantity`}
                      type="number"
                      min="1"
                      step="1"
                      value={group.quantity}
                      onChange={(event) =>
                        updateGroup(outputIndex, groupIndex, {
                          quantity: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${group.key}-weight`}>
                      Weight each (g)
                    </Label>
                    <Input
                      id={`${group.key}-weight`}
                      type="number"
                      min="0"
                      step="any"
                      value={group.weightGrams}
                      onChange={(event) =>
                        updateGroup(outputIndex, groupIndex, {
                          weightGrams: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove container group"
                      disabled={output.groups.length === 1}
                      onClick={() => removeGroup(outputIndex, groupIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addGroup(outputIndex)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add another container type or location
            </Button>
          </section>
        )
      })}

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={bagAndStore.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={cannotSubmit}>
          {bagAndStore.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Save bagging and storage
        </Button>
      </div>
    </form>
  )
}
