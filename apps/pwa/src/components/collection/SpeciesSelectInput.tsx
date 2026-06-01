import { SpeciesSelectDrawer } from "@/components/collection/SpeciesSelectDrawer"
import { useOpenClose } from "@nasti/ui/hooks"
import { Button } from "@nasti/ui/button"
import { SpeciesListItem } from "@/components/species/SpeciesListItem"
import { useSpeciesForTrip } from "@/hooks/useSpeciesForTrip"
import { useSpecies } from "@/hooks/useSpecies"

export const SpeciesSelectInput = ({
  selectedSpeciesId,
  tripId,
  onSelectSpecies,
}: {
  selectedSpeciesId?: string
  tripId: string
  onSelectSpecies: (speciesId: string | null) => void
}) => {
  const { isOpen: isOpenSpeciesDrawer, setIsOpen: setIsOpenSpeciesDrawer } =
    useOpenClose()

  const { data: selectedSpecies } = useSpecies(selectedSpeciesId)
  const { data: targetSpecies } = useSpeciesForTrip(tripId)

  return (
    <>
      {!selectedSpeciesId && (
        <Button
          onClick={() => setIsOpenSpeciesDrawer(true)}
          variant={"outline"}
          className="h-12 w-full text-lg"
        >
          Select species
        </Button>
      )}
      {selectedSpecies && (
        <SpeciesListItem
          species={selectedSpecies}
          className="border-b"
          onCloseClick={() => onSelectSpecies(null)}
        />
      )}
      <SpeciesSelectDrawer
        targetSpecies={targetSpecies}
        isOpen={isOpenSpeciesDrawer}
        onOpenChange={setIsOpenSpeciesDrawer}
        onSelectSpecies={({ id }) => onSelectSpecies(id)}
        selectedSpeciesId={selectedSpeciesId}
      />
    </>
  )
}
