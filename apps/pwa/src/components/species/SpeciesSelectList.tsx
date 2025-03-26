import { Species } from "@nasti/common/types"
import { SpeciesListItem } from "./SpeciesListItem"

export const SpeciesSelectList = ({
  species,
  selectedSpeciesId,
  onSelectSpecies,
}: {
  species?: Species[]
  selectedSpeciesId?: string
  onSelectSpecies: (species: Species) => void
}) => {
  return (
    <>
      {species && species.length > 0 && (
        <div className="border-primary mb-2 overflow-y-scroll border-b">
          {species.map((sp) => (
            <SpeciesListItem
              key={sp.id}
              species={sp}
              onClick={() => onSelectSpecies(sp)}
              isSelected={selectedSpeciesId === sp.id}
            />
          ))}
        </div>
      )}
      {!species ||
        (species.length === 0 && (
          <div className="text-muted-foreground p-4 text-center">
            No species configured for this trip.
          </div>
        ))}
    </>
  )
}
