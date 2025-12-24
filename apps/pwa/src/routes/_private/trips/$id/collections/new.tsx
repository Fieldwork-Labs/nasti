import {
  createFileRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useCallback, useRef, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { useGeoLocation } from "@/contexts/location"
import { useCollectionCreate } from "@/hooks/useCollectionCreate"

import { SpeciesSelectInput } from "@/components/collection/SpeciesSelectInput"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Button } from "@nasti/ui/button"
import { Switch } from "@nasti/ui/switch"
import { Textarea } from "@nasti/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { InfoIcon, X } from "lucide-react"
import { NewCollection } from "@nasti/common/types"
import { cn } from "@nasti/ui/utils"
import { UploadPhotoVariables, usePhotosMutate } from "@/hooks/usePhotosMutate"
import { PhotosForm } from "@/components/common/PhotosForm"
import { useNetwork } from "@/hooks/useNetwork"
import { fileToBase64, putImage } from "@/lib/persistFiles"

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

const stringToNumber = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.trim() === "") return null
    const num = Number(val)
    return isNaN(num) ? undefined : num
  },
  z.number({ message: "Please enter a valid number" }).nullable(),
)

const schema = z
  .object({
    species_id: z.preprocess((val) => {
      if (val === "" || val === undefined) return null
      return val
    }, z.string().nullable()),
    species_uncertain: z.boolean(),
    field_name: z
      .string()
      .optional()
      .transform((val) => val || ""),
    specimen_collected: z.boolean(),
    description: z
      .string()
      .optional()
      .transform((val) => val || ""),
    weight_estimate_kg: stringToNumber,
    plants_sampled_estimate: stringToNumber,
  })
  .refine(
    (data) => {
      // Form is valid if either species_id OR field_name is provided
      return (
        Boolean(data.species_id) ||
        (data.field_name && data.field_name.trim().length > 0)
      )
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
  const { isOnline } = useNetwork()

  const { location, locationDisplay } = useGeoLocation()
  const { mutateAsync: createCollection } = useCollectionCreate({ tripId })
  const collectionIdRef = useRef<string>(crypto.randomUUID())
  const { createPhotoMutation } = usePhotosMutate({
    entityId: collectionIdRef.current,
    entityType: "collection",
    tripId,
  })

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
    control,
  } = useForm<CollectionFormData>({
    defaultValues: { ...defaultValues, species_id: initialSpeciesId },
    resolver: zodResolver(schema),
    mode: "all",
    reValidateMode: "onChange",
  })

  const speciesId = watch("species_id")

  const [enterFieldName, setEnterFieldName] = useState(false)
  const [photos, setPhotos] = useState<UploadPhotoVariables[]>([])

  const { user, org } = useAuth()

  const navigate = useNavigate()

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      if (!user || !org) throw new Error("Not logged in")

      if (!tripId) throw new Error("tripId must be supplied to CollectionForm")
      if (!location) throw new Error("No location available")
      const { latitude, longitude } = location
      const locationPoint = `POINT(${longitude} ${latitude})`
      const newCollection: NewCollection = {
        ...data,
        species_uncertain:
          data.species_uncertain || data.field_name.trim().length > 0,
        id: collectionIdRef.current,
        created_by: user.id,
        created_at: new Date().toISOString(),
        location: locationPoint,
        organisation_id: org.organisation_id,
        trip_id: tripId,
      }
      const collectionPromise = createCollection(newCollection)
      // The UI will get stuck here when offline so only await if online
      if (isOnline) await collectionPromise
      // We need the collection to be created before we can create the photos
      const photoPromises = photos.map((photo) =>
        createPhotoMutation.mutateAsync(photo, { onError: console.error }),
      )
      if (isOnline) await Promise.all(photoPromises)
      // even if the device is offline, we need to await the photo being stored in the DB so we do this
      // separately to the mutation
      await Promise.all(
        photos.map(async (photo) =>
          putImage(photo.id, await fileToBase64(photo.file)),
        ),
      )

      if (createPhotoMutation.isError) {
        console.error(createPhotoMutation.error)
      } else navigate({ to: "/trips/$id", params: { id: tripId } })
    },
    [
      user,
      tripId,
      location,
      createCollection,
      createPhotoMutation,
      navigate,
      isOnline,
    ],
  )

  const handleSetEnterFieldName = useCallback(() => {
    setEnterFieldName(true)
    setValue("species_uncertain", true)
  }, [setEnterFieldName, setValue])

  const handleResetEnterFieldName = useCallback(() => {
    setEnterFieldName(false)
    setValue("field_name", "", { shouldValidate: true })
  }, [setEnterFieldName, setValue])

  const [descriptionFocus, setDescriptionFocus] = useState(false)

  return (
    <div className="h-11/12 flex flex-col justify-between gap-2">
      <div className="overflow-y-scroll">
        <div className="flex items-center p-2 text-2xl">New Collection</div>
        <div className="flex flex-col gap-4 px-1">
          {!enterFieldName && (
            <>
              {/* -mx-1 is to remove the padding on this item */}
              <div className="-mx-1">
                <SpeciesSelectInput
                  onClickFieldName={handleSetEnterFieldName}
                  onSelectSpecies={(speciesId) =>
                    setValue("species_id", speciesId, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  tripId={tripId}
                  selectedSpeciesId={speciesId ?? undefined}
                />
              </div>
            </>
          )}
          {enterFieldName && (
            <div>
              <Label>Field Name</Label>
              <div className="flex w-full items-center space-x-2">
                <Input
                  {...register("field_name")}
                  className="h-12 text-lg"
                  autoComplete="off"
                  tabIndex={1}
                  autoFocus
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
            <Controller
              control={control}
              name="species_uncertain"
              render={({ field: { onChange, value } }) => (
                <Switch
                  id="species_uncertain"
                  checked={value}
                  onChange={onChange}
                  onClick={() => onChange(!value)}
                />
              )}
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
                  identification of the species. Set by default when entering a
                  field name rather than selecting a known species.
                </PopoverContent>
              </Popover>
            </div>
          </div>
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
          <div>
            <Label htmlFor="description">
              <span>Description</span>
            </Label>
            <Textarea
              {...register("description")}
              id="description"
              name="description"
              className={cn(
                "h-20 text-lg transition-all duration-500 ease-in-out",
                descriptionFocus && "h-40",
              )}
              placeholder="Enter notes or description here"
              onFocus={() => setDescriptionFocus(true)}
              onBlur={() => setDescriptionFocus(false)}
            />
          </div>
          <div>
            <Label
              htmlFor="weight_estimate_kg"
              className="flex items-center gap-2"
            >
              <span>Weight Estimated (kg)</span>
              <Popover>
                <PopoverTrigger asChild>
                  <InfoIcon className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  Estimate of the weight of seeds collected
                </PopoverContent>
              </Popover>
            </Label>
            <Input
              autoComplete="off"
              {...register("weight_estimate_kg")}
              className={errors.weight_estimate_kg ? "border-amber-600" : ""}
              id="weight_estimate_kg"
              name="weight_estimate_kg"
            />
            {errors.weight_estimate_kg && (
              <div className="mt-1 text-sm text-amber-600">
                {errors.weight_estimate_kg.message}
              </div>
            )}
          </div>
          <div>
            <Label
              htmlFor="plants_sampled_estimate"
              className="flex items-center gap-2"
            >
              <span>Number of plants sampled</span>
              <Popover>
                <PopoverTrigger asChild>
                  <InfoIcon className="h-4 w-4" />
                </PopoverTrigger>
                <PopoverContent className="w-80">
                  Estimate of the number of plants sampled in this collection
                </PopoverContent>
              </Popover>
            </Label>
            <Input
              autoComplete="off"
              {...register("plants_sampled_estimate")}
              className={
                errors.plants_sampled_estimate ? "border-amber-600" : ""
              }
              id="plants_sampled_estimate"
              name="plants_sampled_estimate"
            />
            {errors.plants_sampled_estimate && (
              <div className="mt-1 text-sm text-amber-600">
                {errors.plants_sampled_estimate.message}
              </div>
            )}
          </div>
          <PhotosForm onPhotosChange={({ add }) => setPhotos(add)} />
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-green-800 px-1 pt-2 md:flex-row md:gap-4">
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
