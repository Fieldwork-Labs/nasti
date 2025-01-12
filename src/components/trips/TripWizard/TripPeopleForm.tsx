import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import { usePeople } from "@/hooks/usePeople"
import { MultiSelect, Option } from "@/components/ui/multi-select"
import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useTripMembers } from "@/hooks/useTripMembers"

type UserId = string

export const TripPeopleForm = () => {
  const { setCurrentStep, trip } = useTripFormWizard()

  const { data: tripMembers, invalidate } = useTripMembers(trip?.id)
  const [selectedPeople, setSelectedPeople] = useState<UserId[]>(
    tripMembers?.map(({ user_id }) => user_id) ?? [],
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: people, error: peopleError } = usePeople()

  const originalMemberIds = useMemo(
    () =>
      tripMembers
        ?.map((member) => member.user_id)
        .sort()
        .join(",") ?? "",
    [tripMembers],
  )

  // Use useEffect to sync state when tripMembers changes
  useEffect(() => {
    if (tripMembers) {
      setSelectedPeople(tripMembers.map((member) => member.user_id))
    }
  }, [tripMembers])

  const hasMemberChanges = useMemo(() => {
    return originalMemberIds !== selectedPeople.sort().join(",")
  }, [originalMemberIds, selectedPeople])

  useEffect(() => {
    if (peopleError) setError(peopleError.message)
  }, [peopleError, setError])

  const options: Option[] =
    people?.map((person) => ({
      value: person.id,
      label: person.name ?? "Unknown Person",
    })) ?? []

  const handleSubmit = useCallback(async () => {
    try {
      if (!trip) throw new Error("No trip available")
      // handle no net change
      if (!hasMemberChanges) {
        setCurrentStep(3)
        return
      }

      setIsSubmitting(true)
      // use currentTripMembers variable to prevent race condition if tripMembers changes throughout this function
      const currentTripMembers = tripMembers

      const { error } = await supabase.from("trip_member").upsert(
        selectedPeople
          .filter(
            (userId) =>
              !currentTripMembers?.find((member) => member.user_id === userId),
          )
          .map((user_id) => ({
            trip_id: trip.id,
            user_id,
            role: "Member",
            joined_at: new Date().toUTCString(),
          })),
      )
      // handle case where trip member is removed
      if (currentTripMembers) {
        const removedMembers = currentTripMembers
          .filter(
            (member) =>
              !selectedPeople.find((user_id) => user_id === member.user_id),
          )
          .map((member) => member.id)
        if (removedMembers.length > 0) {
          const { error: deleteError } = await supabase
            .from("trip_member")
            .delete()
            .in("id", removedMembers)
          if (deleteError) throw new Error(deleteError.message)
        }
      }
      if (error) {
        throw new Error(error.message)
      }

      setIsSubmitting(false)
      setCurrentStep(3)
      invalidate()
    } catch (err) {
      invalidate() // Invalidate on error to ensure consistency
      setIsSubmitting(false)
      setError((err as Error).message)
    }
  }, [
    trip,
    hasMemberChanges,
    selectedPeople,
    tripMembers,
    setCurrentStep,
    invalidate,
  ])

  console.log({ tripMembers })
  return (
    <TripWizardStage
      title="Select People"
      submitLabel="Next"
      cancelLabel="Back"
      allowSubmit={true}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => setCurrentStep(1)}
      onSkip={() => setCurrentStep(3)}
    >
      <MultiSelect
        options={options}
        onValueChange={(ids) => {
          setSelectedPeople(ids)
        }}
        defaultValue={tripMembers?.map((member) => member.user_id)}
        placeholder="Select people"
        animation={2}
      />
      {error && <div className="text-red-500">{error}</div>}
    </TripWizardStage>
  )
}
