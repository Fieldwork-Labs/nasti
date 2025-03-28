import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useGeoLocation } from "@/contexts/location"
import { useCollectionCreate } from "@/hooks/useCollectionCreate"

import { SpeciesSelectInput } from "@/components/collection/SpeciesSelectInput"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Button } from "@nasti/ui/button"
import { Switch } from "@nasti/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { InfoIcon, X } from "lucide-react"
import { Collection } from "@nasti/common/types"

const addCollectionSearchSchema = z.object({
  speciesId: z.string().optional(),
})

export const Route = createFileRoute("/_private/trips/$id/collections/new")({
  component: AddCollection,
  validateSearch: (search) => addCollectionSearchSchema.parse(search),
})

type CollectionFormData = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
  description: string
  weight_estimate_kg: number | null
  plants_sampled_estimate: number | null
}

const schema = z
  .object({
    species_id: z.string().nullable(),
    species_uncertain: z.boolean(),
    field_name: z.string(),
    specimen_collected: z.boolean(),
    description: z.string(),
    weight_estimate_kg: z.number().nullable(),
    plants_sampled_estimate: z.number().nullable(),
  })
  .refine(
    (data) => {
      // If species_id is not specified, field_name should be specified
      if (!data.species_id) {
        return data.field_name.trim().length > 0
      }
      return true
    },
    {
      message: "Field name is required when no species is selected",
      path: ["field_name"],
    },
  )

const defaultValues = {
  species_id: null,
  species_uncertain: false,
  field_name: "",
  specimen_collected: false,
  description: "",
  weight_estimate_kg: null,
  plants_sampled_estimate: null,
}

function AddCollection() {
  const { id: tripId } = useParams({
    from: "/_private/trips/$id/collections/new",
  })

  const { speciesId: initialSpeciesId } = useSearch({
    from: "/_private/trips/$id/collections/new",
  })

  const { location, locationDisplay } = useGeoLocation()
  const { mutateAsync: createCollection } = useCollectionCreate()

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { isValid, isSubmitting },
  } = useForm<CollectionFormData>({
    defaultValues: { ...defaultValues, species_id: initialSpeciesId },
    resolver: zodResolver(schema),
    mode: "onChange",
    criteriaMode: "all",
    reValidateMode: "onChange",
  })

  const speciesId = watch("species_id")

  const [enterFieldName, setEnterFieldName] = useState(false)

  const { user, org } = useAuth()

  const navigate = useNavigate()

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      if (!user || !org) throw new Error("Not logged in")

      if (!tripId) throw new Error("tripId must be supplied to CollectionForm")
      if (!location) throw new Error("No location available")
      const { latitude, longitude } = location
      const locationPoint = `POINT(${longitude} ${latitude})`
      const newCollection: Collection = {
        ...data,
        species_uncertain:
          data.species_uncertain || data.field_name.trim().length > 0,
        id: crypto.randomUUID(),
        created_by: user.id,
        created_at: new Date().toISOString(),
        location: locationPoint,
        organisation_id: org.organisation_id,
        trip_id: tripId,
      }
      await createCollection(newCollection)

      navigate({ to: "/trips/$id", params: { id: tripId } })
    },
    [user, tripId, location, createCollection, navigate],
  )

  const handleResetEnterFieldName = useCallback(() => {
    setEnterFieldName(false)
    setValue("field_name", "")
  }, [setEnterFieldName, setValue])

  return (
    <div className="h-11/12 flex flex-col justify-between">
      <div>
        <div className="flex items-center p-2 text-2xl">New Collection</div>
        <div className="flex flex-col gap-4 px-1">
          {!enterFieldName && (
            <>
              <SpeciesSelectInput
                onClickFieldName={() => setEnterFieldName(true)}
                onSelectSpecies={(speciesId) =>
                  setValue("species_id", speciesId)
                }
                tripId={tripId}
                selectedSpeciesId={speciesId ?? undefined}
              />
              {speciesId && (
                // no need to show this element if species is not selected
                <div className="flex items-center space-x-2">
                  <Switch
                    id="species_uncertain"
                    {...register("species_uncertain")}
                  />
                  <div className="flex items-center gap-2">
                    <Label htmlFor="species_uncertain" className="text-lg">
                      <span>Species Uncertain?</span>
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <InfoIcon className="h-6 w-6" />
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        Select this if you are not 100% certain about the
                        identification of the species.
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}
            </>
          )}
          {enterFieldName && (
            <div>
              <Label>Field Name</Label>
              <div className="flex w-full max-w-sm items-center space-x-2">
                <Input
                  {...register("field_name")}
                  className="h-12 text-lg"
                  autoComplete="off"
                />
                <Button
                  onClick={handleResetEnterFieldName}
                  className="h-12"
                  variant={"outline"}
                >
                  <X />
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Switch
              id="specimen_collected"
              {...register("specimen_collected")}
            />
            <div className="flex items-center gap-2">
              <Label htmlFor="specimen_collected" className="text-lg">
                <span>Specimen collected?</span>
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <InfoIcon className="h-6 w-6" />
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  Select this if you collected a specimen of the plant.
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div>
            <Label htmlFor="location">
              <span>Location</span>
              {location?.accuracy && (
                <span className="px-2 font-light">
                  accuracy: {location?.accuracy.toFixed(1)}m
                </span>
              )}
            </Label>
            <Input
              disabled
              id="location"
              name="location"
              type="text"
              value={locationDisplay}
              className="h-12 text-lg"
            />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 px-1 md:flex-row md:gap-4">
        <Button
          variant={"secondary"}
          onClick={() => navigate({ to: "/trips/$id", params: { id: tripId } })}
          className="h-12 w-full text-lg"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="h-12 w-full text-lg"
          onClick={handleSubmit(onSubmit)}
        >
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  )
}
