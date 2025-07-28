import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Search } from "@nasti/ui/search"
import { Controller, useForm } from "react-hook-form"
import { z } from "zod"

// Input schema (what the form handles)
const tripFilterInputSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
})

// Output schema (what gets passed to your callback)
const tripFilterOutputSchema = tripFilterInputSchema
  .extend({
    dateFrom: z
      .string()
      .optional()
      .refine((date) => !date || !isNaN(Date.parse(date)), {
        message: "Invalid date format",
      })
      .transform((date) => (date && date !== "" ? new Date(date) : undefined)),
    dateTo: z
      .string()
      .optional()
      .refine((date) => !date || !isNaN(Date.parse(date)), {
        message: "Invalid date format",
      })
      .transform((date) => (date && date !== "" ? new Date(date) : undefined)),
  })
  .refine(
    (data) => {
      const dateFromStr = data.dateFrom
      const dateToStr = data.dateTo
      if (!dateFromStr || !dateToStr) return true

      const dateFrom = new Date(dateFromStr)
      const dateTo = new Date(dateToStr)
      return dateFrom < dateTo
    },
    {
      message: "Date From must be before Date To",
      path: ["dateFrom"],
    },
  )

type TripFilterInputData = z.infer<typeof tripFilterInputSchema>
export type TripFilterData = z.infer<typeof tripFilterOutputSchema>

type TripFilterFormProps = {
  isLoading: boolean
  onSetSearchDetails: (searchDetails: TripFilterData) => void
}

export const TripFilterForm = ({
  isLoading,
  onSetSearchDetails,
}: TripFilterFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { isValid },
    setValue,
    control,
  } = useForm<TripFilterInputData>({
    resolver: zodResolver(tripFilterInputSchema),
    mode: "all",
    defaultValues: {
      search: "",
      dateFrom: undefined,
      dateTo: undefined,
    },
  })

  const handleClear = () => {
    // Explicitly set each field
    setValue("search", "")
    setValue("dateFrom", "")
    setValue("dateTo", "")

    // Call your callback with the cleared data
    onSetSearchDetails({
      search: "",
      dateFrom: undefined,
      dateTo: undefined,
    })
  }

  const onSubmit = (data: TripFilterInputData) => {
    // Transform the data before passing to callback
    const result = tripFilterOutputSchema.safeParse(data)
    if (result.success) {
      onSetSearchDetails(result.data)
    }
  }

  return (
    <form
      className="grid grid-rows-2 items-end gap-2 md:flex"
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="form-group flex grow flex-col gap-1">
        <Label htmlFor={"search"} className="text-xs">
          Search Name or Location
        </Label>
        <Controller
          name="search"
          control={control} // You'll need to destructure control from useForm
          render={({ field }) => (
            <Search
              id="search"
              placeholder="Search"
              isSearching={isLoading}
              value={field.value}
              onChange={field.onChange}
              onClear={() => field.onChange("")}
              autoComplete="off"
              className="h-8"
            />
          )}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 md:flex">
        <div className="form-group flex flex-col gap-1">
          <Label className="text-xs" htmlFor="dateFrom">
            Date From
          </Label>
          <Input type="date" {...register("dateFrom")} className="h-8" />
        </div>
        <div className="form-group flex flex-col gap-1">
          <Label className="text-xs" htmlFor="dateTo">
            Date To
          </Label>
          <Input type="date" {...register("dateTo")} className="h-8" />
        </div>
      </div>
      <Button
        type="submit"
        className="h-8 cursor-pointer"
        disabled={!isValid || isLoading}
      >
        Search
      </Button>
      <Button
        variant={"secondary"}
        className="h-8 cursor-pointer"
        onClick={handleClear}
      >
        Clear
      </Button>
    </form>
  )
}
