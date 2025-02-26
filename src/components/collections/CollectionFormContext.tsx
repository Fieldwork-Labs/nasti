import { Collection } from "@/types"
import { createContext, useContext } from "react"
import { useCollectionForm } from "./CollectionForm"

type CollectionFormStage = "form" | "photos"

type CollectionFormProviderProps = {
  stage: CollectionFormStage
  setStage: (stage: CollectionFormStage) => void
  collection: Collection | undefined
  close: () => void
} & ReturnType<typeof useCollectionForm>

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
}: {
  tripId: string
  stage: CollectionFormStage
  setStage: (stage: CollectionFormStage) => void
  close: () => void
  children: React.ReactNode
}) => {
  const { onSubmit, isPending, form, collection } = useCollectionForm({
    tripId,
    onSuccess: (_) => {
      setStage("photos")
    },
  })

  return (
    <CollectionFormContext.Provider
      value={{ stage, setStage, close, onSubmit, collection, isPending, form }}
    >
      {children}
    </CollectionFormContext.Provider>
  )
}
