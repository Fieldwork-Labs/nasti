import {
  CollectionPhotosForm,
  PhotoChanges,
} from "@/components/collection/CollectionPhotos/CollectionPhotosForm"
import { SpeciesSelectInput } from "@/components/collection/SpeciesSelectInput"
import { useAuth } from "@/hooks/useAuth"
import { useCollection } from "@/hooks/useCollection"
import { useCollectionPhotosMutate } from "@/hooks/useCollectionPhotosMutate"
import { useCollectionUpdate } from "@/hooks/useCollectionUpdate"
import { zodResolver } from "@hookform/resolvers/zod"
import { ROLE } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { Switch } from "@nasti/ui/switch"
import { Textarea } from "@nasti/ui/textarea"
import { cn } from "@nasti/ui/utils"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { InfoIcon, X } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import * as z from "zod"

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
    weight_estimate_kg: stringToNumber,
    plants_sampled_estimate: stringToNumber,
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
  weight_estimate_kg: null,
  plants_sampled_estimate: null,
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

  const { user, org } = useAuth()

  const {
    photos: initialPhotos,
    species,
    ...initialValues
  } = useCollection({ collectionId, tripId })

  const { mutate: updateCollection } = useCollectionUpdate({ tripId })
  const { createPhotoMutation, updateCaptionMutation, deletePhotoMutation } =
    useCollectionPhotosMutate({ collectionId, tripId })

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
  const collectionIdRef = useRef<string>(
    initialValues?.id || crypto.randomUUID(),
  )

  // Photo state
  const [photoChanges, setPhotoChanges] = useState<PhotoChanges>({
    add: [],
    keep: initialPhotos,
  })

  // Field name entry toggle
  const [enterFieldName, setEnterFieldName] = useState(
    Boolean(initialValues?.field_name && !initialValues?.species_id),
  )

  const defaultValues = schema.parse({
    ...DEFAULT_VALUES,
    ...initialValues,
    latitude: initialValues.locationCoord?.latitude,
    longitude: initialValues.locationCoord?.longitude,
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

  // Handlers
  const onFormSubmit = useCallback(
    async (data: FormValues) => {
      if (!user || !org) throw new Error("Not logged in")
      if (!tripId) throw new Error("tripId must be supplied")

      const { latitude, longitude, ...rest } = data
      const locationPoint = `POINT(${longitude} ${latitude})`
      console.log({ locationPoint })
      const payload = {
        id: collectionIdRef.current,
        trip_id: tripId,
        organisation_id: org.organisation_id,
        created_by: user.id,
        created_at: new Date().toISOString(),
        location: locationPoint,
        ...rest,
      }
      if (isDirty) updateCollection(payload)

      photoChanges.add.map((photo) =>
        createPhotoMutation.mutate(photo, { onError: console.error }),
      )
      // find which photos have been removed from the initial list
      const removedPhotos = initialPhotos.filter(
        (photo) => !photoChanges.keep.find((p) => p.id === photo.id),
      )
      removedPhotos.map((photo) =>
        deletePhotoMutation.mutate(photo.id, { onError: console.error }),
      )

      // for the remaining photos, update captions if they have changed
      const changedPhotos = photoChanges.keep.filter((kept) => {
        const existing = initialPhotos.find((p) => p.id === kept.id)
        return existing?.caption !== kept.caption
      })

      changedPhotos.forEach((photo) =>
        updateCaptionMutation.mutate({
          photoId: photo.id,
          caption: photo.caption,
        }),
      )
      navigate({
        to: "/trips/$id/collections/$collectionId",
        params: { id: tripId, collectionId },
      })
    },
    [user, org, tripId, location, photoChanges, isDirty],
  )

  const handleSetFieldName = useCallback(() => {
    setEnterFieldName(true)
    setValue("species_uncertain", true)
  }, [setValue])

  const handleResetFieldName = useCallback(() => {
    setEnterFieldName(false)
    setValue("field_name", "", { shouldValidate: true })
  }, [setValue])

  const speciesId = watch("species_id")
  const [descriptionFocus, setDescriptionFocus] = useState(false)

  // You shouldn't be here
  if (initialValues.created_by !== user?.id || org?.role !== ROLE.ADMIN)
    return navigate({
      to: "/trips/$id/collections/$collectionId",
      params: { id: tripId, collectionId },
    })

  return (
    <div className="flex h-full flex-col">
      <h2 className="p-2 text-2xl">{"Edit Collection"}</h2>
      <form
        className="flex flex-1 flex-col justify-between"
        onSubmit={hookSubmit(onFormSubmit)}
      >
        <div className="space-y-4 overflow-y-auto px-2">
          {!enterFieldName ? (
            <SpeciesSelectInput
              tripId={tripId}
              selectedSpeciesId={speciesId || undefined}
              onSelectSpecies={(id) =>
                setValue("species_id", id, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              onClickFieldName={handleSetFieldName}
            />
          ) : (
            <div>
              <Label>Field Name</Label>
              <div className="flex items-center space-x-2">
                <Input
                  {...register("field_name")}
                  className="h-12 text-lg"
                  autoFocus
                />
                <Button onClick={handleResetFieldName} variant="outline">
                  <X />
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Controller
              control={control}
              name="species_uncertain"
              render={({ field }) => (
                <Switch checked={field.value} onChange={field.onChange} />
              )}
            />
            <Label>Species Uncertain?</Label>
            <Popover>
              <PopoverTrigger asChild>
                <InfoIcon className="h-5 w-5" />
              </PopoverTrigger>
              <PopoverContent>
                Toggle if not 100% certain or after entering field name
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center space-x-2">
            <Switch {...register("specimen_collected")} />
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
            <Label>Weight Estimate (kg)</Label>
            <Input {...register("weight_estimate_kg")} />
            {errors.weight_estimate_kg && (
              <p className="text-amber-600">
                {errors.weight_estimate_kg.message}
              </p>
            )}
          </div>

          <div>
            <Label># Plants Sampled</Label>
            <Input {...register("plants_sampled_estimate")} />
            {errors.plants_sampled_estimate && (
              <p className="text-amber-600">
                {errors.plants_sampled_estimate.message}
              </p>
            )}
          </div>
          <CollectionPhotosForm
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
