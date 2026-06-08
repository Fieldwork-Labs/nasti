import { SpeciesSelectInput } from "@/components/collection/SpeciesSelectInput"
import { useAuth } from "@/hooks/useAuth"
import { FullCollection, useCollection } from "@/hooks/useCollection"
import { usePhotosMutate } from "@/hooks/usePhotosMutate"
import { useCollectionUpdate } from "@/hooks/useCollectionUpdate"
import { useNetwork } from "@/hooks/useNetwork"
import { fileToBase64, putImage } from "@/lib/persistFiles"
import { zodResolver } from "@hookform/resolvers/zod"
import { ROLE, UpdateCollection } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { Switch } from "@nasti/ui/switch"
import { Textarea } from "@nasti/ui/textarea"
import { cn } from "@nasti/ui/utils"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { ChevronLeft, InfoIcon, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"
import { PhotosForm, PhotoChanges } from "@/components/common/PhotosForm"
import { stringToNumber } from "@nasti/common/utils"

const schema = z
  .object({
    species_id: z.preprocess(
      (val) => (val === "" ? null : val),
      z.string().nullable(),
    ),
    species_uncertain: z.boolean(),
    field_name: z
      .string()
      .nullable()
      .transform((val) => val || ""),
    specimen_collected: z.boolean(),
    description: z
      .string()
      .optional()
      .transform((val) => val || ""),
    amount_units: z.string().nullable(),
    amount_quantity: stringToNumber,
    latitude: stringToNumber,
    longitude: stringToNumber,
  })
  .refine(
    (data) => Boolean(data.species_id) || data.field_name.trim().length > 0,
    {
      message: "Field name is required when no species is selected",
      path: ["field_name"],
    },
  )

type FormValues = z.infer<typeof schema>

const DEFAULT_VALUES: FormValues = {
  species_id: null,
  species_uncertain: false,
  field_name: "",
  latitude: null,
  longitude: null,
  specimen_collected: false,
  description: "",
  amount_units: "",
  amount_quantity: null,
}

export const Route = createFileRoute(
  "/_private/trips/$id/collections/$collectionId/edit",
)({
  component: CollectionForm,
})

function CollectionForm() {
  const { collectionId, id: tripId } = useParams({
    from: "/_private/trips/$id/collections/$collectionId/edit",
  })
  const collection = useCollection({ collectionId, tripId })

  const navigate = useNavigate({
    from: "/trips/$id/collections/$collectionId/edit",
  })

  const handleBackClick = () => {
    navigate({
      to: "/trips/$id/collections/$collectionId",
      params: { id: tripId, collectionId },
    })
  }

  if (!collection)
    return (
      <div className="flex h-full w-full flex-col items-start">
        <h2 className="p-2 text-2xl">No collection available</h2>
        <Button
          className="flex w-full justify-start text-lg"
          variant="ghost"
          onClick={handleBackClick}
        >
          <ChevronLeft className="h-5 w-5" /> Back
        </Button>
      </div>
    )

  return (
    <CollectionFormReady
      collection={collection}
      collectionId={collectionId}
      tripId={tripId}
    />
  )
}

function CollectionFormReady({
  collection,
  collectionId,
  tripId,
}: {
  collection: FullCollection
  collectionId: string
  tripId: string
}) {
  const { user, organisation, role } = useAuth()

  const { mutateAsync: updateCollection } = useCollectionUpdate({ tripId })
  const { createPhotoMutation, updateCaptionMutation, deletePhotoMutation } =
    usePhotosMutate({
      entityId: collectionId,
      entityType: "collection",
      tripId,
    })

  const { isOnline } = useNetwork()

  const navigate = useNavigate({
    from: "/trips/$id/collections/$collectionId/edit",
  })

  const handleBackClick = () => {
    navigate({
      to: "/trips/$id/collections/$collectionId",
      params: { id: tripId, collectionId },
    })
  }

  // Unique ID: use provided or generate new
  const collectionIdRef = useRef<string>(collection.id)

  const initialPhotos = collection.photos ?? []
  // Photo state
  const [photoChanges, setPhotoChanges] = useState<PhotoChanges>({
    add: [],
    keep: initialPhotos,
  })

  const defaultValues = schema.parse({
    ...DEFAULT_VALUES,
    ...collection,
    latitude: collection.locationCoord?.latitude ?? null,
    longitude: collection.locationCoord?.longitude ?? null,
  })

  // Form setup
  const {
    watch,
    setValue,
    register,
    handleSubmit: hookSubmit,
    formState: { isValid, isSubmitting, errors, isDirty },
    control,
  } = useForm<FormValues>({
    defaultValues,
    resolver: zodResolver(schema),
    mode: "all",
    reValidateMode: "onChange",
  })

  // Field name entry toggle
  const isFieldName =
    watch("specimen_collected") || Boolean(defaultValues.field_name)
  const [enterFieldName, setEnterFieldName] = useState(isFieldName)

  const handleSetIsSpecimenCollected = (val: boolean) => {
    setValue("specimen_collected", val)
    setEnterFieldName(val)
  }

  // Handlers
  const onFormSubmit = useCallback(
    async (data: FormValues) => {
      if (!user || !organisation) throw new Error("Not logged in")
      if (!tripId) throw new Error("tripId must be supplied")

      const { latitude, longitude, ...rest } = data
      const locationPoint = `POINT(${longitude} ${latitude})`

      const payload: UpdateCollection = {
        id: collectionIdRef.current,
        trip_id: tripId,
        organisation_id: organisation.id,
        created_by: user.id,
        created_at: new Date().toISOString(),
        location: locationPoint,
        ...rest,
      }
      if (!isDirty && photoChanges.add.length === 0)
        navigate({
          to: "/trips/$id/collections/$collectionId",
          params: { id: tripId, collectionId },
        })

      const updatePromise = updateCollection(payload)
      if (isOnline) await updatePromise
      photoChanges.add.map((photo) =>
        createPhotoMutation.mutateAsync(photo, { onError: console.error }),
      )
      // even if the device is offline, we need to await the photo being stored in the DB so we do this
      // separately to the mutation
      await Promise.all(
        photoChanges.add.map(async (photo) =>
          putImage(photo.id, await fileToBase64(photo.file)),
        ),
      )
      // find which photos have been removed from the initial list
      const removedPhotos = initialPhotos.filter(
        (photo) => !photoChanges.keep.find((p) => p.id === photo.id),
      )
      const deletePhotoPromises = removedPhotos.map((photo) =>
        deletePhotoMutation.mutateAsync(photo.id, { onError: console.error }),
      )

      // for the remaining photos, update captions if they have changed
      const changedPhotos = photoChanges.keep.filter((kept) => {
        const existing = initialPhotos.find((p) => p.id === kept.id)
        return existing?.caption !== kept.caption
      })

      const changePhotoPromises = changedPhotos.map((photo) =>
        updateCaptionMutation.mutateAsync({
          photoId: photo.id,
          caption: photo.caption,
        }),
      )

      if (isOnline) {
        // do not await the add photo Promises - they're slower and can happen in parallel
        // await Promise.all(addPhotoPromises)
        await Promise.all(deletePhotoPromises)
        await Promise.all(changePhotoPromises)
      }

      return navigate({
        to: "/trips/$id/collections/$collectionId",
        params: { id: tripId, collectionId },
      })
    },
    [user, organisation, tripId, location, photoChanges, isDirty, isOnline],
  )

  const speciesId = watch("species_id")
  const [descriptionFocus, setDescriptionFocus] = useState(false)

  // You shouldn't be here
  if (collection.created_by !== user?.id && role !== ROLE.ADMIN) {
    navigate({
      to: "/trips/$id/collections/$collectionId",
      params: { id: tripId, collectionId },
    })
    return null
  }

  return (
    <div className="flex h-full flex-col">
      <h2 className="p-2 text-2xl">{"Edit Collection"}</h2>
      <form
        className="flex flex-1 flex-col justify-between"
        onSubmit={hookSubmit(onFormSubmit)}
      >
        <div className="space-y-4 overflow-y-auto px-2">
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
                  onClick={(e) => {
                    e.preventDefault()
                    setValue("field_name", "", { shouldValidate: true })
                  }}
                  className="h-12"
                  variant={"outline"}
                >
                  <X />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Switch {...register("species_uncertain")} />
            <Label>Species Uncertain?</Label>
            <Popover>
              <PopoverTrigger asChild>
                <InfoIcon className="h-5 w-5" />
              </PopoverTrigger>
              <PopoverContent>
                Toggle if not 100% certain or to enter a specimen name
              </PopoverContent>
            </Popover>
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
            <Label>Specimen Collected?</Label>
            <Popover>
              <PopoverTrigger asChild>
                <InfoIcon className="h-5 w-5" />
              </PopoverTrigger>
              <PopoverContent>
                Select if you physically collected the specimen
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Latitude</Label>
              <Input
                {...register("latitude")}
                className={errors.latitude ? "border-amber-600" : ""}
              />
              {errors.latitude && (
                <p className="text-amber-600">{errors.latitude.message}</p>
              )}
            </div>
            <div>
              <Label>Longitude</Label>
              <Input
                {...register("longitude")}
                className={errors.longitude ? "border-amber-600" : ""}
              />
              {errors.longitude && (
                <p className="text-amber-600">{errors.longitude.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              {...register("description")}
              className={cn(
                "transition-all",
                descriptionFocus ? "h-40" : "h-20",
              )}
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

          <PhotosForm
            initialPhotos={initialPhotos}
            onPhotosChange={setPhotoChanges}
          />
        </div>

        <div className="flex space-x-2 border-t p-2">
          <Button
            className="w-full"
            variant="secondary"
            onClick={handleBackClick}
          >
            Cancel
          </Button>
          <Button
            className="w-full"
            type="submit"
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </form>
    </div>
  )
}
