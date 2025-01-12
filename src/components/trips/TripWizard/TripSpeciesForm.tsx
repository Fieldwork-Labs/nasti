import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@/components/ui/combobox"
import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useALASpeciesSearch, SearchResult } from "@/hooks/useALASpeciesSearch"
import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TripSpeciesWithDetails, useTripSpecies } from "@/hooks/useTripSpecies"
import { supabase } from "@/lib/supabase"

type GUID = string
type SpeciesName = string

type SelectedSpecies = Record<GUID, SpeciesName>

const reduceTripSpecies = (
  tripSpecies: TripSpeciesWithDetails[] = [],
): SelectedSpecies => {
  return tripSpecies.reduce((result, { species }) => {
    result[species.ala_guid] = species.name
    return result
  }, {} as SelectedSpecies)
}

export const TripSpeciesForm = () => {
  const { setCurrentStep, close, trip } = useTripFormWizard()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState("")

  const {
    data: species,
    isLoading: isLoadingSpeciesSearch,
    error: searchError,
  } = useALASpeciesSearch(searchValue)

  useEffect(() => {
    if (searchError) setError(searchError.message)
  }, [searchError])

  const {
    data: tripSpecies,
    isLoading: isLoadingTripSpecies,
    invalidate,
  } = useTripSpecies(trip?.id)
  const [selectedSpecies, setSelectedSpecies] = useState<SelectedSpecies>(
    reduceTripSpecies(tripSpecies),
  )

  const isLoading = isLoadingTripSpecies || isLoadingSpeciesSearch

  const originalSpeciesIds = useMemo(
    () =>
      tripSpecies
        ?.map(({ species }) => species.ala_guid)
        .sort()
        .join(",") ?? "",
    [tripSpecies],
  )

  const hasSpeciesChanges = useMemo(() => {
    return originalSpeciesIds !== Object.keys(selectedSpecies).sort().join(",")
  }, [originalSpeciesIds, selectedSpecies])

  // Use useEffect to sync state when tripSpecies changes
  useEffect(() => {
    if (tripSpecies) {
      setSelectedSpecies(reduceTripSpecies(tripSpecies))
    }
  }, [tripSpecies])

  const handleSelectSpecies = useCallback(
    (guid: string) => {
      const thisSpecies = species?.find((s) => s.guid === guid)
      setSelectedSpecies((selected) =>
        thisSpecies ? { ...selected, [guid]: thisSpecies.name } : selected,
      )
    },
    [species, setSelectedSpecies],
  )

  const handleRemoveSpecies = useCallback(
    (guid: string) => {
      setSelectedSpecies((selected) => {
        const { [guid]: _, ...rest } = selected
        return rest
      })
    },
    [setSelectedSpecies],
  )

  const handleSubmit = useCallback(async () => {
    try {
      if (!trip) throw new Error("No trip available")
      // handle no net change
      if (!hasSpeciesChanges) {
        close()
        return
      }

      setIsSubmitting(true)
      // use currentTripSpecies variable to prevent race condition if tripMembers changes throughout this function
      const currentTripSpecies = tripSpecies

      // first create the species objects themselves based on the selected species
      const currentTripAlaGuids = currentTripSpecies?.map(
        ({ species }) => species.ala_guid,
      )
      const speciesToCreate = Object.entries(selectedSpecies)
        .filter(
          ([ala_guid]) =>
            // find selected species which are not already in the trip based on ALA guid
            !currentTripAlaGuids?.includes(ala_guid),
        )
        .map(([ala_guid, name]) => ({
          ala_guid,
          name,
          organisation_id: trip.organisation_id,
        }))
      const { error: createSpeciesError, data: createdSpecies } = await supabase
        .from("species")
        .upsert(speciesToCreate)
        .select("id, ala_guid")
      if (createSpeciesError) throw new Error(createSpeciesError.message)

      // then create the trip_species objects based on the newly created species objects
      // TODO ensure previously existing species objects are included
      const tripSpeciesToCreate = Object.keys(selectedSpecies)
        .map((alaGuid) => createdSpecies.find((s) => s.ala_guid === alaGuid))
        .filter(Boolean)
        .map((species) => ({
          trip_id: trip.id,
          species_id: species!.id,
        }))

      console.log({ speciesToCreate, createdSpecies, tripSpeciesToCreate })

      const { error } = await supabase
        .from("trip_species")
        .upsert(tripSpeciesToCreate)

      // handle case where trip member is removed
      if (currentTripSpecies) {
        const removedSpecies = currentTripSpecies
          .filter(
            ({ species }) =>
              !Object.keys(selectedSpecies).find(
                (guid) => guid === species.ala_guid,
              ),
          )
          .map((tripSpecies) => tripSpecies.id)

        if (removedSpecies.length > 0) {
          console.log({ removedSpecies })
          const { error: deleteError } = await supabase
            .from("trip_species")
            .delete()
            .in("id", removedSpecies)
          if (deleteError) throw new Error(deleteError.message)
        }
      }
      if (error) {
        throw new Error(error.message)
      }

      setIsSubmitting(false)
      close()
      invalidate()
    } catch (err) {
      invalidate() // Invalidate on error to ensure consistency
      setIsSubmitting(false)
      setError((err as Error).message)
    }
  }, [trip, hasSpeciesChanges, tripSpecies, selectedSpecies, close, invalidate])

  return (
    <TripWizardStage
      title="Select Target Species"
      submitLabel="Next"
      allowSubmit={true}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onCancel={() => setCurrentStep(2)}
    >
      <div className="flex w-full flex-col gap-4">
        <div className="flex max-h-96 flex-wrap gap-2 overflow-scroll">
          {Object.entries(selectedSpecies).map(([guid, name]) => (
            <Badge
              key={guid}
              className="flex items-center gap-2"
              variant={"outline"}
            >
              <span>{name}</span>
              <Button
                title="Remove"
                onClick={() => handleRemoveSpecies(guid)}
                variant={"ghost"}
                size={"sm"}
                className="p-0 hover:bg-transparent"
              >
                <XIcon className="h-4 w-4 cursor-pointer text-white" />
              </Button>
            </Badge>
          ))}
        </div>
        <Combobox
          onChange={handleSelectSpecies}
          onClose={() => setSearchValue("")}
          disabled={isLoading}
        >
          <ComboboxInput
            aria-label="Species Search"
            displayValue={(species: SearchResult) => species?.name}
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <ComboboxOptions anchor="bottom" className="z-[100]">
            {species?.map((species) => (
              <ComboboxOption
                key={species.guid}
                value={species.guid}
                className="z-[100] flex justify-between"
              >
                <span className="italic">{species.name}</span>
                {species.commonName && <span>{species.commonName}</span>}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </Combobox>

        {error && <div className="text-red-500">{error}</div>}
      </div>
    </TripWizardStage>
  )
}
