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

import { parsePostGISPoint } from "@nasti/common/utils"
import { useUpdateCollection } from "../../hooks/useUpdateCollection"
import { useDataItemLocationMap } from "../common/useDataItemLocationMap"

type CollectionFormData = {
  species_id: string | null
  species_uncertain: boolean
  field_name: string
  specimen_collected: boolean
  collected_on: string
  latitude: number
  longitude: number
  description: string
  amount_description: string
  plants_sampled_estimate: number | null
  collected_by: string | null
}

export const schema = z
  .object({
    species_id: z.string().nullable(),
    species_uncertain: z.boolean(),
    field_name: z.string(),
    specimen_collected: z.boolean(),
    collected_on: z.string().transform((val) => val ?? new Date().toDateString),
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
    amount_description: z
      .string()
      .optional()
      .transform((val) => val ?? ""),
    plants_sampled_estimate: z.number().nullable(),
    collected_by: z.string().uuid().nullable(),
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

const useCollectionForm = ({
  instance,
  tripId,
  onSuccess,
}: {
  instance?: Collection
  tripId?: string
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
            ? parsePostGISPoint(collection.location)
            : {
                latitude: undefined,
                longitude: undefined,
              }),
          specimen_collected: Boolean(collection.specimen_collected),
          description: collection.description ?? "",
          amount_description: collection.amount_description ?? "",
          plants_sampled_estimate: collection.plants_sampled_estimate,
          collected_on: collection.collected_on,
          collected_by: collection.collected_by,
        }
      : {
          species_id: null,
          species_uncertain: false,
          field_name: "",
          latitude: undefined,
          longitude: undefined,
          specimen_collected: false,
          collected_on: new Date().toLocaleDateString(),
          collected_by: user?.id,
          description: "",
          amount_description: "",
          plants_sampled_estimate: null,
        }
  }, [collection, user?.id])

  const form = useForm<CollectionFormData>({
    defaultValues,
    resolver: zodResolver(schema),
    mode: "onChange",
  })

  const {
    mutateAsync: updateCollection,
    isPending,
    error: updateCollectionError,
  } = useUpdateCollection()

  if (updateCollectionError) form.setError("root", updateCollectionError)

  const onSubmit = useCallback(
    async (data: CollectionFormData) => {
      if (!user || !organisation?.id) throw new Error("Not logged in")

      if (!tripId && !collection?.trip_id)
        throw new Error(
          "tripId or collection must be supplied to CollectionForm",
        )

      // type assertion safe because of check above
      const trip_id = (collection ? collection.trip_id : tripId) as string

      const { latitude, longitude, ...rest } = data
      const location = `POINT(${longitude} ${latitude})`
      const newCollection = {
        ...rest,
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

export const CollectionFormProvider = ({
  stage,
  setStage,
  close,
  children,
  tripId,
  instance,
}: {
  instance?: Collection
  tripId?: string
  stage: CollectionFormStage
  setStage: (stage: CollectionFormStage) => void
  close: () => void
  children: React.ReactNode
}) => {
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
