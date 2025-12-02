import { useStorageLocations } from "@/hooks/useBatchStorage"
import { useSpecies } from "@/hooks/useSpecies"
import { useSpeciesSearch } from "@/hooks/useSpeciesSearch"
import { useBatchFiltersContext } from "@/routes/_private/inventory/-components/BatchFiltersContext"
import { Species, StorageLocation } from "@nasti/common/types"
import { Button } from "@nasti/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@nasti/ui/command"
import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@nasti/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nasti/ui/select"
import { Search, X } from "lucide-react"
import { useState } from "react"

export type BatchStatus =
  | "unprocessed"
  | "processed"
  | "any"
  | "pending"
  | "completed"

type BatchInventoryFiltersProps = {
  statuses: BatchStatus[]
  className?: string
}

export const BatchInventoryFilters = ({
  statuses,
  className,
}: BatchInventoryFiltersProps) => {
  const { filters, handleFiltersChange } = useBatchFiltersContext()
  const [speciesSearchOpen, setSpeciesSearchOpen] = useState(false)
  const [locationSearchOpen, setLocationSearchOpen] = useState(false)
  const [speciesSearchTerm, setSpeciesSearchTerm] = useState("")
  const [locationSearchTerm, setLocationSearchTerm] = useState("")

  const { data: speciesList } = useSpeciesSearch(speciesSearchTerm)
  const { data: selectedSpecies } = useSpecies(filters.species)

  // Storage locations
  const { data: storageLocations } = useStorageLocations()

  const filteredStorageLocations = storageLocations?.filter(
    (location: StorageLocation) =>
      location.name.toLowerCase().includes(locationSearchTerm.toLowerCase()) ||
      location.description
        ?.toLowerCase()
        .includes(locationSearchTerm.toLowerCase()),
  )

  const selectedLocation = storageLocations?.find(
    (l: StorageLocation) => l.id === filters.location,
  )

  const hasActiveFilters = Object.entries(filters)
    .filter(([key, value]) => key !== "status" && value !== "any")
    .some(([, v]) => Boolean(v))

  const clearAllFilters = () => {
    handleFiltersChange({
      status: undefined,
      speciesId: null,
      locationId: null,
      search: "",
    })
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filter Batches</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="mr-1 h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status}
            onValueChange={(value) =>
              handleFiltersChange({ status: value as BatchStatus })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent className="w-full">
              <SelectGroup>
                {statuses.map((status) => (
                  <SelectItem
                    key={status}
                    value={status}
                  >{`${status.slice(0, 1).toLocaleUpperCase()}${status.slice(1)}`}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {/* Search Term */}
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform" />
            <Input
              id="search"
              placeholder="Search batches..."
              value={filters.search}
              onChange={(e) => handleFiltersChange({ search: e.target.value })}
              className="pl-10"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
            />
          </div>
        </div>

        {/* Species Filter */}
        <div className="space-y-2">
          <Label>Species</Label>
          <Popover open={speciesSearchOpen} onOpenChange={setSpeciesSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-start"
              >
                {selectedSpecies ? (
                  <span className="truncate">{selectedSpecies.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Select species...
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search species..."
                  value={speciesSearchTerm}
                  onValueChange={setSpeciesSearchTerm}
                />
                <CommandList>
                  <CommandEmpty>No species found.</CommandEmpty>
                  <CommandGroup>
                    {filters.species && (
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          handleFiltersChange({ speciesId: null })
                          setSpeciesSearchOpen(false)
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear species filter
                      </CommandItem>
                    )}
                    {speciesList?.map((species: Species) => (
                      <CommandItem
                        key={species.id}
                        value={species.name}
                        onSelect={() => {
                          handleFiltersChange({ speciesId: species.id })
                          setSpeciesSearchOpen(false)
                        }}
                      >
                        {species.name}
                        {species.indigenous_name && (
                          <span className="text-muted-foreground ml-2 text-sm">
                            ({species.indigenous_name})
                          </span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Storage Location Filter */}
        <div className="space-y-2">
          <Label>Storage Location</Label>
          <Popover
            open={locationSearchOpen}
            onOpenChange={setLocationSearchOpen}
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-start"
              >
                {selectedLocation ? (
                  <span className="truncate">{selectedLocation.name}</span>
                ) : (
                  <span className="text-muted-foreground">
                    Select location...
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-full p-0" align="start">
              <Command>
                <CommandInput
                  placeholder="Search locations..."
                  value={locationSearchTerm}
                  onValueChange={setLocationSearchTerm}
                />
                <CommandList>
                  <CommandEmpty>No locations found.</CommandEmpty>
                  <CommandGroup>
                    {filters.location && (
                      <CommandItem
                        value="none"
                        className="cursor-pointer"
                        onSelect={() => {
                          setLocationSearchTerm("")
                          handleFiltersChange({ locationId: null })
                          setLocationSearchOpen(false)
                        }}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear location filter
                      </CommandItem>
                    )}
                    {filteredStorageLocations?.map(
                      (location: StorageLocation) => (
                        <CommandItem
                          className="cursor-pointer"
                          key={location.id}
                          value={location.name}
                          onSelect={() => {
                            handleFiltersChange({ locationId: location.id })
                            setLocationSearchOpen(false)
                          }}
                        >
                          <div className="flex flex-col">
                            <span>{location.name}</span>
                            {location.description && (
                              <span className="text-muted-foreground text-xs">
                                {location.description}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      ),
                    )}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 border-t pt-2">
          <span className="text-muted-foreground text-sm">Active filters:</span>
          {filters.status && filters.status !== "any" && (
            <div className="flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-sm text-blue-800">
              {filters.status}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 cursor-pointer p-0 hover:bg-blue-200"
                onClick={() => handleFiltersChange({ status: "any" })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {filters.search && (
            <div className="flex items-center gap-1 rounded-md bg-blue-100 px-2 py-1 text-sm text-blue-800">
              Search: "{filters.search}"
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 cursor-pointer p-0 hover:bg-blue-200"
                onClick={() => handleFiltersChange({ search: undefined })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          {selectedSpecies && (
            <div className="flex items-center gap-1 rounded-md bg-green-100 px-2 py-1 text-sm text-green-800">
              {selectedSpecies.name}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 cursor-pointer p-0 hover:bg-green-200"
                onClick={() => handleFiltersChange({ speciesId: null })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {selectedLocation && (
            <div className="flex items-center gap-1 rounded-md bg-orange-100 px-2 py-1 text-sm text-orange-800">
              {selectedLocation.name}
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 cursor-pointer p-0 hover:bg-orange-200"
                onClick={() => handleFiltersChange({ locationId: null })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
