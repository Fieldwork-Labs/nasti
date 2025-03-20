import { Trip } from "@nasti/common/types"
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"

import { useOpenClose, type UseOpenClose } from "@nasti/ui/hooks"
import { useUpdateTrip } from "../forms/useUpdateTrip"

type TripFormWizardContext = UseOpenClose & {
  trip: Trip | undefined
  setTrip: (trip: Trip) => void
  currentStep: number
  setCurrentStep: (step: number) => void
  saveTrip: (newTripDetails: Partial<Trip>) => Promise<Trip>
}

const tripFormDefault = {
  trip: undefined,
  setTrip: (_: Trip) => {},
  saveTrip: () => {},
  currentStep: 0,
  setCurrentStep: () => {},
}

const TripFormProviderContext = createContext<TripFormWizardContext>(
  {} as TripFormWizardContext,
)

export const TripFormProvider = ({ children }: { children: ReactNode }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [trip, setTrip] = useState<Trip | undefined>(undefined)
  const { close, ...openClose } = useOpenClose()

  const handleClose = useCallback(() => {
    setCurrentStep(0)
    setTrip(undefined)
    close()
  }, [setCurrentStep, setTrip, close])

  const saveTrip = useUpdateTrip(trip)

  return (
    <TripFormProviderContext.Provider
      value={{
        ...tripFormDefault,
        ...openClose,
        close: handleClose,
        currentStep,
        setCurrentStep,
        trip,
        setTrip,
        saveTrip: saveTrip.mutateAsync,
      }}
    >
      {children}
    </TripFormProviderContext.Provider>
  )
}

export const useTripFormWizard = () => useContext(TripFormProviderContext)
