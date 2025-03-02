import { Collection } from "@/types"
import { createContext, useContext } from "react"
import { useCollectionForm } from "./CollectionForm"

type CollectionFormStage = "form" | "photos"

type UseCollectionFormReturn = ReturnType<typeof useCollectionForm>

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
  const { onSubmit, isPending, form, collection } = useCollectionForm({
    tripId,
    instance,
    onSuccess: (_) => {
      setStage("photos")
    },
  })

  return (
    <CollectionFormContext.Provider
      value={{
        stage,
        setStage,
        close,
        onSubmit,
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
