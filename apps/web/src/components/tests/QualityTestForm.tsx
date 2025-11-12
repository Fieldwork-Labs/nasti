import {
  useForm,
  useFieldArray,
  useFormContext,
  FormProvider,
  UseFieldArrayReturn,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { Loader2, ChevronDown, Check, Plus, Trash2 } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Textarea } from "@nasti/ui/textarea"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"

import {
  useCreateQualityTest,
  useUpdateQualityTest,
} from "@/hooks/useBatchTreatments"
import type { QualityTestType, QualityTest } from "@nasti/common/types"

// Test type options
const testTypeOptions: { value: QualityTestType; label: string }[] = [
  { value: "x-ray", label: "X-Ray" },
  { value: "cut test", label: "Cut Test" },
  { value: "tz", label: "TZ" },
  { value: "slow purity", label: "Slow Purity" },
  { value: "quick purity", label: "Quick Purity" },
]

// Validation schema for a single repeat
const repeatSchema = z.object({
  weight_grams: z.coerce.number().min(0.001, "Weight must be greater than 0"),
  viable_seed_count: z.coerce
    .number()
    .int("Must be a whole number")
    .min(0, "Count cannot be negative"),
  dead_seed_count: z.coerce
    .number()
    .int("Must be a whole number")
    .min(0, "Count cannot be negative"),
})

// Main form schema
const qualityTestSchema = z.object({
  test_type: z.enum(["x-ray", "cut test", "tz", "slow purity", "quick purity"]),
  psu_grams: z.coerce.number().min(0.001, "PSU must be greater than 0"),
  inert_seed_weight_grams: z.coerce.number().default(0),
  other_species_seeds_grams: z.coerce.number().optional().default(0),
  relative_humidity_percent: z.coerce
    .number()
    .min(0, "RH must be at least 0%")
    .max(100, "RH cannot exceed 100%"),
  repeats: z
    .array(repeatSchema)
    .min(1, "At least one repeat is required")
    .max(5, "Maximum 5 repeats allowed"),
  notes: z.string().optional(),
})

type QualityTestFormData = z.infer<typeof qualityTestSchema>

const SeedCounts = ({
  fieldArray,
}: {
  fieldArray: UseFieldArrayReturn<QualityTestFormData>
}) => {
  const { register, formState, watch } = useFormContext<QualityTestFormData>()
  const { fields, remove } = fieldArray

  const getDeadSeedCount = (index: number) =>
    parseInt(watch(`repeats.${index}.dead_seed_count`) as unknown as string)
  const getViableSeedCount = (index: number) =>
    parseInt(watch(`repeats.${index}.viable_seed_count`) as unknown as string)
  const getTotalSeedCount = (index: number) =>
    getDeadSeedCount(index) + getViableSeedCount(index)

  return fields.map((field, index) => (
    <div key={field.id} className="rounded-lg border border-gray-200 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">Repeat {index + 1}</span>
        {fields.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => remove(index)}
            className="cursor-pointer text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* Weight */}
        <div className="space-y-1">
          <Label htmlFor={`repeats.${index}.weight_grams`}>Weight (g) *</Label>
          <Input
            type="number"
            step="0.001"
            min="0"
            placeholder="0.000"
            {...register(`repeats.${index}.weight_grams`)}
          />
          {formState.errors.repeats?.[index]?.weight_grams && (
            <p className="text-xs text-red-600">
              {formState.errors.repeats[index]?.weight_grams?.message}
            </p>
          )}
        </div>

        {/* Viable Seeds */}
        <div className="space-y-1">
          <Label htmlFor={`repeats.${index}.viable_seed_count`}>
            Viable Seeds *
          </Label>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            {...register(`repeats.${index}.viable_seed_count`)}
          />
          {formState.errors.repeats?.[index]?.viable_seed_count && (
            <p className="text-xs text-red-600">
              {formState.errors.repeats[index]?.viable_seed_count?.message}
            </p>
          )}
        </div>

        {/* Dead Seeds */}
        <div className="space-y-1">
          <Label htmlFor={`repeats.${index}.dead_seed_count`}>
            Dead Seeds *
          </Label>
          <Input
            type="number"
            min="0"
            step="1"
            placeholder="0"
            {...register(`repeats.${index}.dead_seed_count`)}
          />
          {formState.errors.repeats?.[index]?.dead_seed_count && (
            <p className="text-xs text-red-600">
              {formState.errors.repeats[index]?.dead_seed_count?.message}
            </p>
          )}
        </div>

        {/* Seed Count */}
        <div className="space-y-1">
          <Label>Seed Count (calculated)</Label>
          <Input
            type="number"
            min="0"
            step="1"
            disabled
            placeholder="0"
            value={getTotalSeedCount(index)}
          />
          {formState.errors.repeats?.[index]?.dead_seed_count && (
            <p className="text-xs text-red-600">
              {formState.errors.repeats[index]?.dead_seed_count?.message}
            </p>
          )}
        </div>
      </div>
    </div>
  ))
}

type QualityTestFormProps = {
  batchId: string
  existingTest?: QualityTest
  onSuccess?: () => void
  onCancel?: () => void
  className?: string
}

export const QualityTestForm = ({
  batchId,
  existingTest,
  onSuccess,
  onCancel,
  className,
}: QualityTestFormProps) => {
  const { toast } = useToast()
  const { mutateAsync: createTest, isPending: isCreating } =
    useCreateQualityTest()
  const { mutateAsync: updateTest, isPending: isUpdating } =
    useUpdateQualityTest()
  const [testTypeOpen, setTestTypeOpen] = useState(false)

  const isPending = isCreating || isUpdating
  const isEditing = Boolean(existingTest)

  // Form setup with default values
  const form = useForm<QualityTestFormData>({
    resolver: zodResolver(qualityTestSchema),
    defaultValues: existingTest?.result || {
      test_type: "x-ray",
      inert_seed_weight_grams: 0,
      other_species_seeds_grams: 0,
      repeats: [
        {
          weight_grams: 0,
          viable_seed_count: 0,
          dead_seed_count: 0,
        },
      ],
      notes: "",
    },
  })

  const { register, control } = form

  // Field array for repeats
  const fieldArray = useFieldArray({
    control,
    name: "repeats",
  })

  const onSubmit = async (data: QualityTestFormData) => {
    try {
      if (isEditing && existingTest) {
        await updateTest({
          id: existingTest.id,
          result: data,
        })

        toast({
          description: "Quality test updated successfully",
        })
      } else {
        await createTest({
          batchId,
          result: data,
        })

        toast({
          description: "Quality test recorded successfully",
        })
      }

      onSuccess?.()
    } catch (error) {
      console.error("Failed to save quality test:", error)
      toast({
        description: `Failed to ${isEditing ? "update" : "record"} quality test`,
        variant: "destructive",
      })
    }
  }

  const addRepeat = () => {
    if (fieldArray.fields.length < 5) {
      fieldArray.append({
        weight_grams: 0,
        viable_seed_count: 0,
        dead_seed_count: 0,
      })
    }
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn("space-y-4", className)}
      >
        <div className="grid grid-cols-2 gap-2">
          {/* Test Type */}
          <div className="space-y-2">
            <Label htmlFor="test_type">Test Type *</Label>
            <Popover open={testTypeOpen} onOpenChange={setTestTypeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between"
                >
                  {testTypeOptions.find(
                    (t) => t.value === form.watch("test_type"),
                  )?.label || "Select test type"}
                  <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandList>
                    <CommandEmpty>No test type found.</CommandEmpty>
                    <CommandGroup>
                      {testTypeOptions.map((testType) => (
                        <CommandItem
                          key={testType.value}
                          value={testType.value}
                          onSelect={() => {
                            form.setValue("test_type", testType.value)
                            setTestTypeOpen(false)
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              form.watch("test_type") === testType.value
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {testType.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.formState.errors.test_type && (
              <p className="text-sm text-red-600">
                {form.formState.errors.test_type.message}
              </p>
            )}
          </div>
          {/* Relative Humidity */}
          <div className="space-y-2">
            <Label htmlFor="relative_humidity_percent">
              Relative Humidity (%) *
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="relative_humidity_percent"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="Enter RH percentage"
                {...register("relative_humidity_percent")}
                className="flex-1"
              />
              <span className="text-muted-foreground min-w-[20px] text-sm">
                %
              </span>
            </div>
            {form.formState.errors.relative_humidity_percent && (
              <p className="text-sm text-red-600">
                {form.formState.errors.relative_humidity_percent.message}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {/* PSU */}
          <div className="space-y-2">
            <Label htmlFor="psu_grams">PSU (grams) *</Label>
            <div className="flex items-center gap-2">
              <Input
                id="psu_grams"
                type="number"
                step="0.001"
                min="0"
                placeholder="Enter PSU weight"
                {...register("psu_grams")}
                className="flex-1"
              />
              <span className="text-muted-foreground min-w-[20px] text-sm">
                g
              </span>
            </div>
            {form.formState.errors.psu_grams && (
              <p className="text-sm text-red-600">
                {form.formState.errors.psu_grams.message}
              </p>
            )}
          </div>

          {/* Inert Seed Weight (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="inert_seed_weight_grams">
              Inert Seed Weight (grams) *
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="inert_seed_weight_grams"
                type="number"
                step="0.001"
                min="0"
                {...register("inert_seed_weight_grams")}
                className="flex-1"
              />
              <span className="text-muted-foreground min-w-[20px] text-sm">
                g
              </span>
            </div>
            {form.formState.errors.inert_seed_weight_grams && (
              <p className="text-sm text-red-600">
                {form.formState.errors.inert_seed_weight_grams.message}
              </p>
            )}
          </div>

          {/* Other Species Seeds (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="other_species_seeds_grams">
              Other Species Seeds (grams)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="other_species_seeds_grams"
                type="number"
                step="0.001"
                min="0"
                {...register("other_species_seeds_grams")}
                className="flex-1"
              />
              <span className="text-muted-foreground min-w-[20px] text-sm">
                g
              </span>
            </div>
            {form.formState.errors.other_species_seeds_grams && (
              <p className="text-sm text-red-600">
                {form.formState.errors.other_species_seeds_grams.message}
              </p>
            )}
          </div>
        </div>

        {/* Repeats Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Seed Counts (1-5 repeats) *</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRepeat}
              disabled={fieldArray.fields.length >= 5}
              className="cursor-pointer"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Repeat
            </Button>
          </div>

          <SeedCounts fieldArray={fieldArray} />

          {form.formState.errors.repeats && (
            <p className="text-sm text-red-600">
              {Array.isArray(form.formState.errors.repeats)
                ? "Please fix errors in seed counts"
                : form.formState.errors.repeats.message}
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            placeholder="Additional test notes..."
            {...register("notes")}
            rows={3}
          />
          {form.formState.errors.notes && (
            <p className="text-sm text-red-600">
              {form.formState.errors.notes.message}
            </p>
          )}
        </div>

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
            disabled={isPending}
            className="min-w-[120px] cursor-pointer"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Test" : "Record Test"}
          </Button>
        </div>
      </form>
    </FormProvider>
  )
}
