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
import { useTripDetail } from "@/hooks/useTripDetail"

type TripFormWizardContext = UseOpenClose & {
  trip: Trip | undefined
  setTripId: (id: string) => void
  currentStep: number
  setCurrentStep: (step: number) => void
  saveTrip: (newTripDetails: Partial<Trip>) => Promise<Trip>
}

const tripFormDefault = {
  trip: undefined,
  setTripId: (_: string) => {},
  saveTrip: () => {},
  currentStep: 0,
  setCurrentStep: () => {},
}

const TripFormProviderContext = createContext<TripFormWizardContext>(
  {} as TripFormWizardContext,
)

export const TripFormProvider = ({ children }: { children: ReactNode }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [tripId, setTripId] = useState<string | undefined>(undefined)
  const { data: trip } = useTripDetail(tripId)
  const { close, ...openClose } = useOpenClose()

  const handleClose = useCallback(() => {
    setCurrentStep(0)
    setTripId(undefined)
    close()
  }, [setCurrentStep, setTripId, close])

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
        setTripId,
        saveTrip: saveTrip.mutateAsync,
      }}
    >
      {children}
    </TripFormProviderContext.Provider>
  )
}

export const useTripFormWizard = () => useContext(TripFormProviderContext)
