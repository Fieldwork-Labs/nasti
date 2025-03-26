import { SpeciesSelectDrawer } from "@/components/collection/SpeciesSelectDrawer"
import { useOpenClose } from "@nasti/ui/hooks"
import { Button } from "@nasti/ui/button"
import { SpeciesListItem } from "@/components/species/SpeciesListItem"
import { useTripSpecies, useTripSpeciesList } from "@/hooks/useTripSpecies"

export const SpeciesSelectInput = ({
  selectedSpeciesId,
  tripId,
  onSelectSpecies,
  onClickFieldName,
}: {
  selectedSpeciesId?: string
  tripId: string
  onSelectSpecies: (speciesId: string | null) => void
  onClickFieldName: () => void
}) => {
  const { isOpen: isOpenSpeciesDrawer, setIsOpen: setIsOpenSpeciesDrawer } =
    useOpenClose()

  const selectedSpecies = useTripSpecies({
    tripId,
    speciesId: selectedSpeciesId,
  })
  const speciesList = useTripSpeciesList({ tripId })

  return (
    <>
      {!selectedSpeciesId && (
        <div className="px-1">
          <Button
            onClick={() => setIsOpenSpeciesDrawer(true)}
            variant={"outline"}
            className="h-12 w-full text-lg"
          >
            Select known species
          </Button>
          <div className="text-muted-foreground w-full text-center text-sm font-semibold">
            OR
          </div>
          <Button
            onClick={() => onClickFieldName()}
            variant={"outline"}
            className="h-12 w-full text-lg"
          >
            Enter Field Name
          </Button>
        </div>
      )}
      {selectedSpecies && (
        <SpeciesListItem
          species={selectedSpecies}
          className="border-b"
          onCloseClick={() => onSelectSpecies(null)}
        />
      )}
      <SpeciesSelectDrawer
        species={speciesList?.data}
        isOpen={isOpenSpeciesDrawer}
        onOpenChange={setIsOpenSpeciesDrawer}
        onSelectSpecies={({ id }) => onSelectSpecies(id)}
        selectedSpeciesId={selectedSpeciesId}
      />
    </>
  )
}
