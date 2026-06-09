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

import { SpeciesSelectInput } from "@/components/collection/SpeciesSelectInput"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Button } from "@nasti/ui/button"
import { Switch } from "@nasti/ui/switch"
import { Textarea } from "@nasti/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import { PhenologyRangeInput } from "@nasti/ui/phenologyRangeInput"
import { InfoIcon, X } from "lucide-react"
import { NewScoutingNote } from "@nasti/common/types"
import { cn } from "@nasti/ui/utils"
import { UploadPhotoVariables } from "@/hooks/usePhotosMutate"
import { PhotosForm } from "@/components/common/PhotosForm"
import { fileToBase64, putImage } from "@/lib/persistFiles"
import { usePhotosMutate } from "@/hooks/usePhotosMutate"
import { useScoutingNoteCreate } from "@/hooks/useScoutingNoteCreate"
import {
  baseDefaultValues,
  BaseFormData,
  baseSchema,
} from "@/components/common/dataSchema"

const addCollectionSearchSchema = z.object({
  speciesId: z.string().optional(),
})

export const Route = createFileRoute("/_private/trips/$id/scouting-notes/new")({
  component: AddCollection,
  validateSearch: (search) => addCollectionSearchSchema.parse(search),
})

function AddCollection() {
  const { id: tripId } = useParams({
    from: "/_private/trips/$id/scouting-notes/new",
  })

  const { speciesId: initialSpeciesId } = useSearch({
    from: "/_private/trips/$id/scouting-notes/new",
  })
  const { location, locationDisplay } = useGeoLocation()
  const { mutateAsync: createScoutingNote } = useScoutingNoteCreate({ tripId })
  const scoutingNoteIdRef = useRef<string>(crypto.randomUUID())
  const { createPhotoMutation } = usePhotosMutate({
    entityId: scoutingNoteIdRef.current,
    entityType: "scoutingNote",
    tripId,
  })

  const {
    watch,
    setValue,
    register,
    handleSubmit,
    formState: { isValid, isSubmitting },
    control,
  } = useForm<BaseFormData>({
    defaultValues: { ...baseDefaultValues, species_id: initialSpeciesId },
    resolver: zodResolver(baseSchema),
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

  const { user, organisation } = useAuth()

  const navigate = useNavigate()

  const onSubmit = useCallback(
    async (data: BaseFormData) => {
      if (!user || !organisation) throw new Error("Not logged in")

      if (!tripId) throw new Error("tripId must be supplied to CollectionForm")
      if (!location) throw new Error("No location available")
      const { latitude, longitude } = location
      const locationPoint = `POINT(${longitude} ${latitude})`
      const newScoutingNote: NewScoutingNote = {
        ...data,
        species_uncertain:
          data.species_uncertain || data.field_name.trim().length > 0,
        id: scoutingNoteIdRef.current,
        created_by: user.id,
        created_at: new Date().toISOString(),
        location: locationPoint,
        organisation_id: organisation.id,
        trip_id: tripId,
      }
      await createScoutingNote(newScoutingNote)
      await Promise.all(
        photos.map(async (photo) =>
          putImage(photo.id, await fileToBase64(photo.file)),
        ),
      )
      await Promise.all(
        photos.map((photo) =>
          createPhotoMutation.mutateAsync(photo, { onError: console.error }),
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
      createScoutingNote,
      createPhotoMutation,
      navigate,
      photos,
    ],
  )

  const [descriptionFocus, setDescriptionFocus] = useState(false)

  return (
    <div className="h-11/12 flex flex-col justify-between gap-2">
      <div>
        <div className="flex items-center p-2 text-2xl">New Scouting Note</div>
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
                  field name rather than selecting a known species.
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
          <Controller
            control={control}
            name="phenology_start"
            render={({ field: startField }) => (
              <Controller
                control={control}
                name="phenology_peak"
                render={({ field: peakField }) => (
                  <Controller
                    control={control}
                    name="phenology_end"
                    render={({ field: endField }) => (
                      <PhenologyRangeInput
                        value={[
                          startField.value,
                          peakField.value,
                          endField.value,
                        ]}
                        onValueChange={([start, peak, end]) => {
                          startField.onChange(start)
                          peakField.onChange(peak)
                          endField.onChange(end)
                        }}
                      />
                    )}
                  />
                )}
              />
            )}
          />
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
