import { useState } from "react"
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
  ComboboxButton,
} from "@headlessui/react"

import { cn } from "@/lib/utils"
import { useSpeciesSearch } from "@/hooks/useSpeciesSearch"
import { ChevronsUpDown } from "lucide-react"
import { labelVariants } from "../ui/label"

type SpeciesComboboxProps = {
  value: string | null
  onChange: (value: string | null) => void
  error?: string
}

export const SpeciesSearchCombobox = ({
  value,
  onChange,
  error,
}: SpeciesComboboxProps) => {
  const [searchTerm, setSearchTerm] = useState("")
  const {
    data: species,
    isLoading,
    error: searchError,
  } = useSpeciesSearch(searchTerm)

  return (
    <div className="flex flex-col gap-2">
      <label className={labelVariants()}>Species</label>
      <Combobox value={value} onChange={onChange}>
        <div className="relative">
          <div
            className={cn(
              "relative w-full cursor-default overflow-hidden rounded-lg border bg-secondary-background text-left",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2",
              error && "border-orange-800 focus:border-orange-500",
            )}
          >
            <ComboboxInput
              className={cn(
                "w-full border-none bg-secondary-background py-2 pl-3 pr-10 text-sm leading-5",
                "focus:outline-none focus:ring-0",
              )}
              displayValue={(id: string) =>
                species?.find((s) => s.id === id)?.name ?? ""
              }
              placeholder="Select species..."
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronsUpDown
                className="h-5 w-5 text-gray-400"
                aria-hidden="true"
              />
            </ComboboxButton>
          </div>
          <ComboboxOptions
            className={cn(
              "absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-secondary-background py-1 text-base",
              "z-50 shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm",
            )}
          >
            {isLoading && (
              <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                Searching...
              </div>
            )}
            {searchError && (
              <div className="relative cursor-default select-none px-4 py-2 text-red-500">
                Error: {searchError.message}
              </div>
            )}
            {!isLoading && !searchError && species?.length === 0 && (
              <div className="relative cursor-default select-none px-4 py-2 text-gray-700">
                No species found.
              </div>
            )}
            {species?.map((species) => (
              <ComboboxOption
                key={species.id}
                value={species.id}
                className={({ active }) =>
                  cn(
                    "relative cursor-default select-none py-2 pl-6 pr-4",
                    active ? "bg-secondary" : "text-secondary",
                  )
                }
              >
                {({ selected, active }) => (
                  <>
                    <span
                      className={cn(
                        "block truncate",
                        selected ? "font-medium" : "font-normal",
                      )}
                    >
                      {species.name}
                      {species.indigenous_name && (
                        <span
                          className={cn(
                            "block text-sm",
                            active ? "text-green-200" : "text-gray-500",
                          )}
                        >
                          {species.indigenous_name}
                        </span>
                      )}
                    </span>
                    {selected && (
                      <span
                        className={cn(
                          "absolute inset-y-0 left-0 flex items-center pl-3",
                          active ? "text-white" : "text-blue-600",
                        )}
                      >
                        ✓
                      </span>
                    )}
                  </>
                )}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        </div>
      </Combobox>
      {error && (
        <div className="flex h-4 justify-end text-xs text-orange-800">
          {error}
        </div>
      )}
    </div>
  )
}
