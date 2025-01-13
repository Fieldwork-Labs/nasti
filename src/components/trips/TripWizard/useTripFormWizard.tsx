import { supabase } from "@/lib/supabase"
import { Trip } from "@/types"
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"

import useUserStore from "@/store/userStore"
import useOpenClose, { UseOpenClose } from "@/hooks/useOpenClose"
import { useTrips } from "@/hooks/useTrips"

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
  const { orgId } = useUserStore()
  const { close, ...openClose } = useOpenClose()
  const { invalidate } = useTrips()

  const handleClose = useCallback(() => {
    setCurrentStep(0)
    setTrip(undefined)
    close()
  }, [setCurrentStep, setTrip, close])

  const saveTrip = useCallback(
    async (newTripDetails: Partial<Trip>) => {
      if (!orgId) throw new Error("No organisation available")
      if (!trip) throw new Error("No trip available")

      const sbresponse = await supabase
        .from("trip")
        .upsert({
          ...trip,
          ...newTripDetails,
        })
        .select("*")
        .single()

      if (sbresponse.error) throw new Error(sbresponse.error.message)
      // type assertion required because of bad typing in supabase for postgis geometry columns
      const newTrip = sbresponse.data as Trip
      setTrip(newTrip)
      invalidate()
      return newTrip
    },
    [orgId, trip, invalidate],
  )

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
        saveTrip,
      }}
    >
      {children}
    </TripFormProviderContext.Provider>
  )
}

export const useTripFormWizard = () => useContext(TripFormProviderContext)
