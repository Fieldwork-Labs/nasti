import { zodResolver } from "@hookform/resolvers/zod"
import { Collection } from "@nasti/common/types"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import useUserStore from "@/store/userStore"

import { parseWkbPoint } from "@nasti/common/utils"
import {
  CollectionContainerInput,
  MaybeNewCollectionWithContainers,
  useUpdateCollection,
} from "../../hooks/useUpdateCollection"
import { useDataItemLocationMap } from "../common/useDataItemLocationMap"
import { stringToNumber } from "@nasti/common/utils"
import { useCollectionContainers } from "@/hooks/useContainers"
import { Spinner } from "@nasti/ui/spinner"
import { collectedOnSchema, formatDateInputValue } from "./collectionDate"

export const schema = z
  .object({
    species_id: z.string().nullable(),
    species_uncertain: z.boolean(),
    field_name: z.string(),
    specimen_collected: z.boolean(),
    collected_on: collectedOnSchema,
    latitude: z
      .number({
        required_error: "Latitude is required",
        invalid_type_error: "Latitude must be a number",
      })
      .min(-90)
      .max(90),
    longitude: z
      .number({
        required_error: "Longitude is required",
        invalid_type_error: "Longitude must be a number",
      })
      .min(-180)
      .max(180),

    description: z.string(),
    containers: z
      .array(
        z.object({
          container_id: z.string().uuid("Select a container"),
          amount: stringToNumber,
        }),
      )
      .default([]),
    duration: z.string().nullable(),
    collected_by: z.string().uuid(),
    person_ids: z.array(z.string().uuid()).default([]),
    phenology_start: z.number().min(-100).max(100).nullable(),
    phenology_peak: z.number().min(-100).max(100).nullable(),
    phenology_end: z.number().min(-100).max(100).nullable(),
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
      message: "Specimen name is required when no species is selected",
      path: ["field_name"],
    },
  )

export type CollectionFormData = z.infer<typeof schema>

const useCollectionForm = ({
  instance,
  tripId,
  initialContainers,
  onSuccess,
}: {
  instance?: Collection
  tripId?: string
  initialContainers: CollectionContainerInput[]
  onSuccess: (collection: Collection) => void
}) => {
  const { organisation, user } = useUserStore()
  const [collection, setCollection] = useState<Collection | undefined>(instance)

  const defaultValues = useMemo(() => {
    return collection
      ? {
          species_id: collection.species_id,
          species_uncertain: Boolean(collection.species_uncertain),
          field_name: collection.field_name ?? "",
          ...(collection?.location
            ? parseWkbPoint(collection.location)
            : {
                latitude: undefined,
                longitude: undefined,
              }),
          specimen_collected: Boolean(collection.specimen_collected),
          description: collection.description ?? "",
          phenology_start: collection.phenology_start,
          phenology_peak: collection.phenology_peak,
          phenology_end: collection.phenology_end,
          containers: initialContainers,
          duration: collection.duration ?? null,
          collected_on: collection.collected_on,
          collected_by: collection.collected_by,
          person_ids: collection.person_ids ?? [],
        }
      : {
          species_id: null,
          species_uncertain: false,
          field_name: "",
          latitude: undefined,
          longitude: undefined,
          specimen_collected: false,
          collected_on: formatDateInputValue(new Date()),
          collected_by: user?.id,
          person_ids: [],
          description: "",
          phenology_start: null,
          phenology_peak: null,
          phenology_end: null,
          containers: initialContainers,
          duration: null,
        }
  }, [collection, initialContainers, user?.id])

  const form = useForm<CollectionFormData>({
    defaultValues,
    resolver: zodResolver(schema),
    mode: "onChange",
  })

  const { mutateAsync: updateCollection, isPending } = useUpdateCollection()

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      form.clearErrors("root")

      try {
        if (!user || !organisation?.id) throw new Error("Not logged in")

        if (!tripId && !collection?.trip_id)
          throw new Error(
            "tripId or collection must be supplied to CollectionForm",
          )

        // type assertion safe because of check above
        const trip_id = (collection ? collection.trip_id : tripId) as string

        const { latitude, longitude, containers, ...rest } = data
        const location = `POINT(${longitude} ${latitude})`
        const newCollection: MaybeNewCollectionWithContainers = {
          ...rest,
          containers,
          id: collection?.id,
          created_by: user.id,
          collected_by: user.id,
          location,
          organisation_id: organisation.id,
          trip_id,
        }
        const updatedRecord = await updateCollection(newCollection)

        if (onSuccess && updatedRecord) {
          setCollection(updatedRecord)
          form.reset(data)
          onSuccess(updatedRecord)
        }
      } catch (error) {
        console.error("Collection submission failed:", error)
        form.setError("root", {
          type: "server",
          message:
            error instanceof Error
              ? error.message
              : "Failed to save collection",
        })
      }
    },
    [user, organisation, tripId, collection, updateCollection, onSuccess, form],
  )

  const {
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useDataItemLocationMap({
    form,
  })

  return {
    tripId,
    collection,
    form,
    onSubmit: form.handleSubmit(onSubmit),
    handleSelectLocation,
    initialLocation,
    showLocationMap,
    setShowLocationMap,
    isPending,
  }
}

type CollectionFormStage = "form" | "photos"

type UseCollectionFormReturn = ReturnType<typeof useCollectionForm>
export type CollectionFormProps = Pick<
  ReturnType<typeof useCollectionForm>,
  "form" | "tripId"
>

type CollectionFormProviderProps = {
  stage: CollectionFormStage
  setStage: (stage: CollectionFormStage) => void
  collection: Collection | undefined
  close: () => void
} & UseCollectionFormReturn

const CollectionFormContext = createContext<
  CollectionFormProviderProps | undefined
>(undefined)

export const useCollectionFormContext = () => {
  const context = useContext(CollectionFormContext)
  if (!context) {
    throw new Error(
      "useCollectionFormContext must be used within a CollectionFormProvider",
    )
  }
  return context
}

type ProviderProps = {
  instance?: Collection
  tripId?: string
  stage: CollectionFormStage
  setStage: (stage: CollectionFormStage) => void
  close: () => void
  children: React.ReactNode
}

// The collection's containers live in a separate table, so they arrive after
// the collection itself. Wait for them here so the form below is mounted once
// with its real default values and stays the single source of truth.
export const CollectionFormProvider = (props: ProviderProps) => {
  const { data: collectionContainers, isLoading } = useCollectionContainers(
    props.instance?.id,
  )

  if (props.instance && isLoading)
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    )

  return (
    <CollectionFormProviderInner
      {...props}
      initialContainers={
        collectionContainers?.map(({ container_id, amount }) => ({
          container_id,
          amount,
        })) ?? []
      }
    />
  )
}

const CollectionFormProviderInner = ({
  stage,
  setStage,
  close,
  children,
  tripId,
  instance,
  initialContainers,
}: ProviderProps & { initialContainers: CollectionContainerInput[] }) => {
  const {
    onSubmit,
    isPending,
    form,
    collection,
    showLocationMap,
    setShowLocationMap,
    handleSelectLocation,
    initialLocation,
  } = useCollectionForm({
    tripId,
    instance,
    initialContainers,
    onSuccess: (_) => {
      setStage("photos")
    },
  })

  useEffect(() => {
    return () => form.reset()
  }, [form])

  return (
    <CollectionFormContext.Provider
      value={{
        stage,
        setStage,
        close,
        onSubmit,
        showLocationMap,
        setShowLocationMap,
        handleSelectLocation,
        initialLocation,
        collection,
        isPending,
        form,
        tripId,
      }}
    >
      {children}
    </CollectionFormContext.Provider>
  )
}
