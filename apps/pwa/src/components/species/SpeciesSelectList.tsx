import { Species } from "@nasti/common/types"
import { SpeciesListItem } from "./SpeciesListItem"
import { useSpeciesList } from "@/hooks/useSpeciesList"
import { useMiniSearch } from "@/hooks/useMiniSearch"
import { Input } from "@nasti/ui/input"
import { Button } from "@nasti/ui/button"
import { XIcon } from "lucide-react"

export const SpeciesSelectList = ({
  targetSpecies,
  selectedSpeciesId,
  onSelectSpecies,
}: {
  targetSpecies?: Species[]
  selectedSpeciesId?: string
  onSelectSpecies: (species: Species) => void
}) => {
  const { data: speciesList } = useSpeciesList()

  const {
    searchResults,
    searchValue,
    onSearchChange,
    resetSearch,
    isSearching,
  } = useMiniSearch(
    speciesList ?? [],
    {
      fields: ["name"],
      idField: "id",
    },
    {
      fuzzy: 0.2,
    },
  )

  const displaySpecies =
    isSearching || targetSpecies?.length === 0 ? searchResults : targetSpecies

  return (
    <div>
      <span className="relative mb-1 block">
        <Input
          className="focus-visible:ring-0"
          placeholder="Search species names"
          autoComplete="off"
          autoFocus
          autoCorrect="off"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 cursor-pointer text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          onClick={() => {
            resetSearch?.()
          }}
        >
          <XIcon className="size-4" />
          <span className="sr-only">Clear</span>
        </Button>
      </span>
      {displaySpecies && displaySpecies.length > 0 && (
        <div className="border-primary mb-2 overflow-y-scroll border-b">
          {displaySpecies.map((sp) => (
            <SpeciesListItem
              key={sp.id}
              species={sp}
              onClick={() => onSelectSpecies(sp)}
              isSelected={selectedSpeciesId === sp.id}
            />
          ))}
        </div>
      )}
      {!displaySpecies ||
        (displaySpecies.length === 0 && (
          <div className="text-muted-foreground p-4 text-center">
            No species configured for this trip.
          </div>
        ))}
    </div>
  )
}
