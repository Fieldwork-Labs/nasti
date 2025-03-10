// useTripPeopleForm.ts
import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "@nasti/common/supabase"
import { useTripMembers } from "@/hooks/useTripMembers"
import { usePeople } from "@/hooks/usePeople"
import { Option, MultiSelect } from "@nasti/ui/multi-select"
import { Trip } from "@nasti/common/types"

type UserId = string

type TripPeopleFormArgs = {
  trip?: Trip
  onSave: () => void
}

export const useTripPeopleForm = ({ trip, onSave }: TripPeopleFormArgs) => {
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
  }, [peopleError])

  const options: Option[] =
    people
      ?.filter(({ is_active }) => is_active)
      .map((person) => ({
        value: person.id,
        label: person.name ?? "Unknown Person",
      })) ?? []

  const handleSubmit = useCallback(async () => {
    try {
      if (!trip) throw new Error("No trip available")
      if (!hasMemberChanges) {
        onSave()
        return
      }

      setIsSubmitting(true)
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
      onSave()
      invalidate()
    } catch (err) {
      invalidate()
      setIsSubmitting(false)
      setError((err as Error).message)
    }
  }, [trip, hasMemberChanges, selectedPeople, tripMembers, onSave, invalidate])

  return {
    selectedPeople,
    options,
    isSubmitting,
    error,
    onPeopleChange: setSelectedPeople,
    handleSubmit,
    defaultValue: tripMembers?.map((member) => member.user_id),
  }
}

export interface TripPeopleFormProps {
  options: Option[]
  error: string | null
  onPeopleChange: (ids: UserId[]) => void
  defaultValue?: UserId[]
}

export const TripPeopleForm = ({
  options,
  error,
  onPeopleChange,
  defaultValue,
}: TripPeopleFormProps) => {
  return (
    <>
      <MultiSelect
        options={options}
        onValueChange={onPeopleChange}
        defaultValue={defaultValue}
        placeholder="Select people"
        animation={2}
      />
      {error && <div className="text-red-500">{error}</div>}
    </>
  )
}
