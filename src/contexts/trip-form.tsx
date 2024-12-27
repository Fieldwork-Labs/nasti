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

import { useForm } from "react-hook-form"

export type TripFormData = {
  name: Trip["name"]
  startDate: Trip["start_date"]
  endDate: Trip["end_date"]
}

type TripFormOptions = {
  instance?: Trip
  onSuccess?: (trip: Trip) => void
  onError?: (message: string) => void
}

export const useTripForm = ({
  instance,
  onSuccess,
  onError,
}: TripFormOptions) => {
  const { orgId } = useUserStore()

  const {
    register,
    handleSubmit,
    formState: { isValid, isSubmitting, errors },
  } = useForm<TripFormData>({
    mode: "all",
    values: instance
      ? {
          name: instance.name,
          startDate: instance.start_date,
          endDate: instance.end_date,
        }
      : undefined,
  })

  const onSubmit = useCallback(
    async ({ name, startDate, endDate }: TripFormData) => {
      if (!orgId) throw new Error("No organisation available")

      const sbresponse = await supabase
        .from("trip")
        .upsert({
          id: instance ? instance.id : undefined,
          name,
          start_date: startDate,
          end_date: endDate,
          organisation_id: orgId,
        })
        .select("*")
        .single()

      if (sbresponse.error) onError?.(sbresponse.error.message)
      else {
        onSuccess?.(sbresponse.data)
      }
    },
    [orgId, instance, onSuccess, onError],
  )

  return {
    register,
    handleSubmit: handleSubmit(onSubmit),
    isValid,
    isSubmitting,
    errors,
  }
}

type TripFormWizardContext = {
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
      setTrip(sbresponse.data)
      return sbresponse.data
    },
    [orgId, trip],
  )

  return (
    <TripFormProviderContext.Provider
      value={{
        ...tripFormDefault,
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
