import { LeafIcon, XIcon } from "lucide-react"
import { Button } from "@nasti/ui/button"
import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@nasti/ui/combobox"

import { useCallback, useEffect, useState } from "react"
import { useDebounce } from "@uidotdev/usehooks"
import { supabase } from "@nasti/common/supabase"
import {
  AlaSpeciesSearchResult,
  useALASpeciesSearch,
} from "@nasti/common/hooks/useALASpeciesSearch"
import useUserStore from "@/store/userStore"
import { useQuery } from "@tanstack/react-query"
import { Species } from "@nasti/common/types"
import { useALASpeciesDetail } from "@nasti/common/hooks/useALASpeciesDetail"
import { useALAImage } from "@nasti/common/hooks/useALAImage"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { FormField } from "@nasti/ui/formField"
import { Label } from "@nasti/ui/label"

type SpeciesFormArgs = {
  onCreate?: (species: Species) => void
}

const getSpecies = async (alaGuid: string, orgId: string) =>
  await supabase
    .from("species")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("ala_guid", alaGuid)

const useDoesSpeciesExist = (alaGuid?: string) => {
  const { organisation } = useUserStore()
  const { data } = useQuery({
    queryKey: ["speciesAlaGuid", alaGuid],
    queryFn: () =>
      alaGuid && organisation?.id
        ? getSpecies(alaGuid, organisation.id)
        : undefined,
    enabled: Boolean(alaGuid),
  })

  return Boolean(data?.data && data?.data?.length > 0)
}

export const useSpeciesForm = ({ onCreate }: SpeciesFormArgs) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchValue, setSearchValue] = useState("")
  const { organisation } = useUserStore()

  const debouncedSearch = useDebounce(searchValue, 300)
  const {
    data: species,
    isLoading,
    error: searchError,
  } = useALASpeciesSearch(debouncedSearch)

  useEffect(() => {
    if (searchError) setError(searchError.message)
  }, [searchError])

  const [selectedSpecies, setSelectedSpecies] =
    useState<AlaSpeciesSearchResult>()

  const [indigName, setIndigName] = useState<string>("")

  useEffect(() => {
    return () => {
      setSelectedSpecies(undefined)
      setSearchValue("")
      setError(null)
    }
  }, [])

  const alreadyExists = useDoesSpeciesExist(selectedSpecies?.guid)

  const handleSubmit = useCallback(async () => {
    try {
      if (!organisation?.id || !selectedSpecies?.guid) return null
      if (alreadyExists) throw new Error("Species already added")

      setIsSubmitting(true)

      const { data, error: createSpeciesError } = await supabase
        .from("species")
        .insert({
          ala_guid: selectedSpecies.guid,
          organisation_id: organisation.id,
          name: selectedSpecies.name,
          indigenous_name: indigName,
        })
        .select("*")
        .single()

      if (createSpeciesError) throw new Error(createSpeciesError.message)
      if (onCreate) onCreate(data)
      setIsSubmitting(false)
    } catch (err) {
      setIsSubmitting(false)
      setError((err as Error).message)
    }
  }, [selectedSpecies, organisation, alreadyExists, indigName, onCreate])

  return {
    selectedSpecies,
    searchValue,
    isSubmitting,
    isLoading,
    error,
    searchResults: species,
    canSubmit: !alreadyExists && !error,
    onSearchChange: setSearchValue,
    onSelectSpecies: setSelectedSpecies,
    onClear: () => setSelectedSpecies(undefined),
    onSubmit: handleSubmit,
    onSearchClose: () => setSearchValue(""),
    indigName,
    setIndigName,
  }
}

export interface SpeciesFormProps {
  selectedSpecies?: AlaSpeciesSearchResult
  isLoading: boolean
  error: string | null
  searchResults: AlaSpeciesSearchResult[] | undefined
  onSearchChange: (value: string) => void
  onSelectSpecies: (species?: AlaSpeciesSearchResult) => void
  onClear: () => void
  onSearchClose: () => void
  canSubmit: boolean
  indigName: string
  setIndigName: (newName: string) => void
}

export const SpeciesForm = ({
  selectedSpecies,
  isLoading,
  error,
  searchResults,
  indigName,
  setIndigName,
  onSearchChange,
  onSelectSpecies,
  onClear,
  onSearchClose,
}: SpeciesFormProps) => {
  const { data } = useALASpeciesDetail(selectedSpecies?.guid)
  const { data: image } = useALAImage(data?.imageIdentifier, "thumbnail")

  return (
    <div className="flex w-full flex-col gap-4">
      {selectedSpecies && (
        <div className="flex w-full justify-between gap-2 rounded-sm border">
          {image ? (
            <span className="flex h-20 w-20 content-center justify-center">
              <img
                src={image}
                alt={`${name} Image`}
                className="w-20 rounded-l-sm object-cover text-sm"
              />
            </span>
          ) : (
            <span className="flex h-20 w-20 items-center justify-center bg-slate-500">
              <LeafIcon />
            </span>
          )}
          <div className="text-foreground flex h-full w-full flex-col pr-2">
            <div className="flex items-center justify-between">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <i className="max-w-56 truncate font-semibold">
                      {selectedSpecies?.name}
                    </i>
                  </TooltipTrigger>
                  <TooltipContent>{selectedSpecies.name}</TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <Button
                title="Remove"
                onClick={onClear}
                variant="ghost"
                size="sm"
                className="p-0 hover:bg-transparent"
              >
                <XIcon className="h-4 w-4 cursor-pointer text-white" />
              </Button>
            </div>
            <div className="flex flex-col text-xs">
              {data && data.commonNames.length > 0 && (
                <span>{data.commonNames[0].nameString}</span>
              )}
            </div>
          </div>
        </div>
      )}
      {!selectedSpecies && (
        <>
          <div className="form-group flex flex-col gap-2">
            <Label title="Search species name">Search species name</Label>
            <Combobox
              onChange={(guid: string) =>
                onSelectSpecies(searchResults?.find((sp) => sp.guid === guid))
              }
              onClose={onSearchClose}
              disabled={isLoading}
            >
              <ComboboxInput
                aria-label="Species Search"
                displayValue={(species: AlaSpeciesSearchResult) =>
                  species?.name
                }
                onChange={(event) => onSearchChange(event.target.value)}
              />
              <ComboboxOptions anchor="bottom" className="z-100">
                {searchResults?.map((species) => (
                  <ComboboxOption
                    key={species.guid}
                    value={species.guid}
                    className="z-100 flex justify-between"
                  >
                    <span className="italic">{species.name}</span>
                    {species.commonName && <span>{species.commonName}</span>}
                  </ComboboxOption>
                ))}
              </ComboboxOptions>
            </Combobox>
          </div>
        </>
      )}
      {error && <div className="text-red-500">{error}</div>}
      <FormField
        name="indigenous_name"
        type="text"
        value={indigName}
        onChange={(e) => setIndigName(e.target.value)}
        label="Indigenous Name"
      />
    </div>
  )
}
