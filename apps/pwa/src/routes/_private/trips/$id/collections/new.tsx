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

// --- Schema & Types ---
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
    amount_units: z.string().nullable(),
    amount_quantity: stringToNumber,
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
      message: "Specimen name is required when no species is selected",
      path: ["field_name"],
    },
  )

type CollectionFormData = z.infer<typeof schema>

const defaultValues = {
  species_id: null,
  species_uncertain: false,
  field_name: "",
  specimen_collected: false,
  description: "",
  amount_units: "",
  amount_quantity: null,
}

function AddCollection() {
  const { id: tripId } = useParams({
    from: "/_private/trips/$id/collections/new",
  })

  const { speciesId: initialSpeciesId } = useSearch({
    from: "/_private/trips/$id/collections/new",
  })
  const { isOnline } = useNetwork()
  const { user, org } = useAuth()

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
    control,
    formState: { isValid, isSubmitting, errors },
  } = useForm<CollectionFormData>({
    defaultValues: {
      ...defaultValues,
      species_id: initialSpeciesId,
    },
    resolver: zodResolver(schema),
    mode: "all",
    reValidateMode: "onChange",
  })

  const speciesId = watch("species_id")

  const isSpecimenCollected = watch("specimen_collected")
  const [enterFieldName, setEnterFieldName] = useState(isSpecimenCollected)

  const handleSetIsSpecimenCollected = (val: boolean) => {
    setValue("specimen_collected", val)
    setEnterFieldName(val)
  }

  const [photos, setPhotos] = useState<UploadPhotoVariables[]>([])

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
        collected_by: user.id,
        created_at: new Date().toISOString(),
        collected_on: new Date().toDateString(),
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
  const [descriptionFocus, setDescriptionFocus] = useState(false)

  return (
    <div className="h-11/12 flex flex-col justify-between gap-2">
      <div>
        <div className="flex items-center p-2 text-2xl">New Collection</div>
        <div className="flex flex-col gap-4 px-1">
          <SpeciesSelectInput
            onSelectSpecies={(speciesId) =>
              setValue("species_id", speciesId, {
                shouldValidate: true,
                shouldDirty: true,
              })
            }
            tripId={tripId}
            selectedSpeciesId={speciesId ?? undefined}
          />
          {enterFieldName && (
            <div>
              <Label>Specimen Name</Label>
              <div className="flex w-full items-center space-x-2">
                <Input
                  {...register("field_name")}
                  className="h-12 text-lg"
                  autoComplete="off"
                  tabIndex={1}
                  autoFocus
                />
                <Button
                  onClick={() =>
                    setValue("field_name", "", { shouldValidate: true })
                  }
                  className="h-12"
                  variant={"outline"}
                >
                  <X />
                </Button>
              </div>
            </div>
          )}
          <div className="flex items-center space-x-2">
            <Switch id="species_uncertain" {...register("species_uncertain")} />

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
                  specimen name rather than selecting a known species.
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name="specimen_collected"
              render={({ field: { value } }) => (
                <Switch
                  id="specimen_collected"
                  checked={value}
                  onCheckedChange={handleSetIsSpecimenCollected}
                />
              )}
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
            <Label className="flex items-center gap-2">
              <span>Amount</span>
            </Label>
            <div className="flex w-full gap-2">
              <div className="w-full">
                <Label htmlFor="amount_quantity" className="text-sm">
                  Quantity
                </Label>
                <Input
                  autoComplete="off"
                  {...register("amount_quantity")}
                  className={cn(
                    "w-full",
                    errors.amount_quantity ? "border-amber-600" : "",
                  )}
                  id="amount_quantity"
                  name="amount_quantity"
                />
                {errors.amount_quantity && (
                  <div className="mt-1 text-sm text-amber-600">
                    {errors.amount_quantity.message}
                  </div>
                )}
              </div>
              <div className="w-full">
                <Label htmlFor="amount_units" className="text-sm">
                  Units
                </Label>
                <Input
                  autoComplete="off"
                  {...register("amount_units")}
                  className={cn(
                    "w-full",
                    errors.amount_units ? "border-amber-600" : "",
                  )}
                  id="amount_units"
                  name="amount_units"
                />
                {errors.amount_units && (
                  <div className="mt-1 text-sm text-amber-600">
                    {errors.amount_units.message}
                  </div>
                )}
              </div>
            </div>
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
