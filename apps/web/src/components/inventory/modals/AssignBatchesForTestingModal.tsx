import { useEffect, useMemo, useState } from "react"
import { useForm, FormProvider, useFormContext } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Loader2, Package, Send } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { Button } from "@nasti/ui/button"
import { Label } from "@nasti/ui/label"
import { Badge } from "@nasti/ui/badge"
import { Switch } from "@nasti/ui/switch"
import { Input } from "@nasti/ui/input"
import { useToast } from "@nasti/ui/hooks"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"

import { useOrganisationLinks } from "@/hooks/useTestingOrgs"
import type { BatchWithCurrentLocationAndSpecies } from "@/hooks/useBatches"

import { useAssignBatchesForTesting } from "@/hooks/useAssignBatchesForTesting"
import { cn } from "@nasti/ui/utils"

const assignBatchesSchema = z.object({
  testing_org_id: z.string().min(1, "Please select a testing organisation"),
  sample_weights: z.record(
    z.string(),
    z.object({
      assignment_type: z.enum(["sample", "full_batch"]),
      weight_grams: z.number().positive().optional(),
    }),
  ),
})

type AssignBatchesFormData = z.infer<typeof assignBatchesSchema>

const BatchSampleRow = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  const { setValue, setError, watch } = useFormContext<AssignBatchesFormData>()
  const valuesByBatch = watch("sample_weights")

  const values = valuesByBatch[batch.id]
  const isSample = values?.assignment_type === "sample"

  const handleSampleWeightChange = (value: string) => {
    const newValue = parseInt(value)
    if (batch.weight_grams && newValue > batch.weight_grams) {
      setError(`sample_weights.${batch.id}.weight_grams`, {
        message: "Sample weight must be less than the total batch weight",
      })
    }

    setValue(
      "sample_weights",
      {
        ...valuesByBatch,
        [batch.id]: {
          ...values,
          weight_grams: parseInt(value),
        },
      },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  const handleSampleAssignmentTypeChange = (isSampleVal: boolean) => {
    let weight_grams = values?.weight_grams
    if (!isSampleVal) weight_grams = undefined
    setValue(
      "sample_weights",
      {
        ...valuesByBatch,
        [batch.id]: {
          weight_grams,
          assignment_type: isSampleVal ? "sample" : "full_batch",
        },
      },
      { shouldDirty: true, shouldValidate: true },
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{batch.code}</span>
          <Badge variant="outline" className="text-xs">
            Max: {batch.weight_grams}g
          </Badge>
        </div>
        <div className="flex items-center space-x-2">
          <Label
            className={cn("text-sm", isSample ? "font-light" : "font-bold")}
            htmlFor="isSample"
          >
            Full Batch
          </Label>
          <Switch
            id="isSample"
            checked={isSample}
            onCheckedChange={handleSampleAssignmentTypeChange}
            className={"cursor-pointer"}
          />
          <Label
            className={cn("text-sm", isSample ? "font-bold" : "font-light")}
            htmlFor="isSample"
          >
            Sample
          </Label>
        </div>
      </div>
      <div className="flex w-36 items-center gap-1 text-sm">
        <Input
          type="number"
          min="1"
          max={batch.weight_grams || undefined}
          disabled={!isSample}
          placeholder={isSample ? "0" : `${batch.weight_grams}`}
          value={values?.weight_grams || ""}
          onChange={(e) => handleSampleWeightChange(e.target.value)}
        />
        g
      </div>
    </div>
  )
}

type AssignBatchesForTestingModalProps = {
  isOpen: boolean
  onClose: () => void
  selectedBatches: BatchWithCurrentLocationAndSpecies[]
  onSuccess?: () => void
}

export const AssignBatchesForTestingModal = ({
  isOpen,
  onClose,
  selectedBatches,
  onSuccess,
}: AssignBatchesForTestingModalProps) => {
  const { toast } = useToast()
  const assignBatchesMutation = useAssignBatchesForTesting()
  const { data: organisationLinks } = useOrganisationLinks()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const sampleWeights = useMemo(
    () =>
      selectedBatches.reduce(
        (acc, batch) => {
          acc[batch.id] = {
            assignment_type: "sample",
            weight_grams: 0,
          }
          return acc
        },
        {} as AssignBatchesFormData["sample_weights"],
      ),
    [selectedBatches],
  )

  const form = useForm<AssignBatchesFormData>({
    resolver: zodResolver(assignBatchesSchema),
    defaultValues: {
      testing_org_id: "",
      sample_weights: sampleWeights,
    },
  })

  // update form data when selected batches prop changes
  useEffect(() => {
    form.setValue("sample_weights", sampleWeights)
  }, [form, sampleWeights])

  const assignmentTypes = Object.values(form.watch("sample_weights")).map(
    (sampleWeight) => sampleWeight.assignment_type,
  )
  const selectedTestingOrgId = form.watch("testing_org_id")

  const hasSamples = assignmentTypes.some(
    (assignmentType) => assignmentType === "sample",
  )
  const hasFullBatches = assignmentTypes.some(
    (assignmentType) => assignmentType === "full_batch",
  )
  // Filter organisations based on assignment type
  const availableOrgs = organisationLinks?.filter((link) => {
    if (link.can_process && link.can_test) return true
    else if (link.can_process) return hasSamples
    else if (link.can_test) return hasFullBatches
  })

  // Calculate total weight
  const totalWeight = selectedBatches.reduce(
    (sum, batch) => sum + (batch.weight_grams || 0),
    0,
  )

  if (!isOpen) return null

  const onSubmit = async (data: AssignBatchesFormData) => {
    setIsSubmitting(true)

    try {
      // Prepare batch assignments
      const batch_assignments = selectedBatches.map((batch) => {
        const sampleDetails = data.sample_weights[batch.id]
        const assignment: {
          batch_id: string
          sample_weight_grams?: number
          assignment_type: "sample" | "full_batch"
        } = {
          batch_id: batch.id,
          assignment_type: sampleDetails?.assignment_type,
        }

        // Add sample weight if assignment type is 'sample'
        if (sampleDetails && sampleDetails.assignment_type === "sample") {
          const sampleWeight =
            sampleDetails.weight_grams ?? batch.weight_grams ?? 0
          if (sampleWeight <= 0) {
            throw new Error(
              `Invalid sample weight for batch ${batch.code}. Must be greater than 0.`,
            )
          }
          if (sampleWeight >= (batch.weight_grams || 0)) {
            throw new Error(
              `Sample weight for batch ${batch.code} must be less than the total batch weight.`,
            )
          }
          assignment.sample_weight_grams = sampleWeight
        }

        return assignment
      })

      await assignBatchesMutation.mutateAsync({
        batch_assignments,
        testing_org_id: data.testing_org_id,
      })

      toast({
        description: `Successfully assigned ${selectedBatches.length} batch${selectedBatches.length > 1 ? "es" : ""} for testing`,
      })

      onSuccess?.()
      onClose()
      // Reset form and state
      form.reset()
    } catch (error) {
      console.error("Assignment failed:", error)
      toast({
        description:
          error instanceof Error
            ? error.message
            : "Failed to assign batches for testing",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="text-primary h-5 w-5" />
            Assign Batches for Testing
          </DialogTitle>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Selected Batches Summary */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Selected Batches ({selectedBatches.length})
              </Label>
              <div className="bg-muted/20 max-h-32 space-y-2 overflow-y-auto rounded-lg border p-3">
                {selectedBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Package className="text-primary h-4 w-4" />
                      <span className="font-mono">{batch.code}</span>
                      {batch.species && (
                        <span className="text-muted-foreground text-xs">
                          ({batch.species.name})
                        </span>
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {batch.weight_grams}g
                    </Badge>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-sm font-medium">
                <span>Total Weight:</span>
                <Badge variant="secondary">{totalWeight}g</Badge>
              </div>
            </div>

            {/* Testing Organisation Selection */}
            <div className="space-y-2">
              <Label htmlFor="testing_org_id" className="text-sm font-medium">
                Testing Organisation
              </Label>
              <Select
                value={form.watch("testing_org_id")}
                onValueChange={(value) =>
                  form.setValue("testing_org_id", value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a testing organisation" />
                </SelectTrigger>
                <SelectContent>
                  {availableOrgs?.map((link) => (
                    <SelectItem key={link.id} value={link.testing_org_id}>
                      {link.testing_org.name}{" "}
                      {link.can_test && <Badge>Can test</Badge>}{" "}
                      {link.can_process && <Badge>Can process</Badge>}
                    </SelectItem>
                  ))}
                  {(!availableOrgs || availableOrgs.length === 0) && (
                    <div className="text-muted-foreground p-2 text-center text-sm">
                      No testers available with relevant permissions for these
                      batches
                    </div>
                  )}
                </SelectContent>
              </Select>
              {form.formState.errors.testing_org_id && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.testing_org_id.message}
                </p>
              )}
            </div>

            <div className="animate-in fade-in duration-400 space-y-3">
              <Label className="text-sm font-medium">Batch settings</Label>
              <div className="space-y-3 rounded-lg border p-4">
                {selectedBatches.map((batch) => (
                  <BatchSampleRow key={batch.id} batch={batch} />
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                Enter the weight of the sample to send from each batch. The
                sample weight must be less than the total batch weight.
              </p>
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isSubmitting ||
                  !selectedTestingOrgId ||
                  !availableOrgs ||
                  availableOrgs.length === 0
                }
                className="min-w-[120px]"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Assign Batches
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  )
}
