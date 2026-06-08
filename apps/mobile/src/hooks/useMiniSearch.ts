import MiniSearch, { type Options, type SearchOptions } from "minisearch"
import { useCallback, useMemo, useRef, useState } from "react"

type MiniSearchConfig<T> = Omit<Options<T>, "idField"> & {
  idField?: keyof T & string
}

interface UseMiniSearchResult<T> {
  searchResults: T[]
  searchValue: string
  onSearchChange: (val: string) => void
  resetSearch: () => void
  isSearching: boolean
}

export function useMiniSearch<T extends Record<string, unknown>>(
  data: T[],
  config: MiniSearchConfig<T>,
  searchOptions?: SearchOptions,
): UseMiniSearchResult<T> {
  const [searchValue, setSearchValue] = useState("")
  const miniSearchRef = useRef<MiniSearch<T> | null>(null)

  const idField = (config.idField ?? "id") as keyof T

  const configKey = JSON.stringify(config)
  const stableConfig = useMemo(
    () => ({
      ...config,
      idField: config.idField ?? "id",
      extractField:
        config.extractField ??
        ((document: T, fieldName: string): string => {
          const value = fieldName.split(".").reduce<unknown>((doc, key) => {
            if (Array.isArray(doc)) {
              return doc.map((item) => item?.[key]).flat()
            }
            return doc && typeof doc === "object"
              ? (doc as Record<string, unknown>)[key]
              : undefined
          }, document)

          if (value === undefined || value === null) {
            return ""
          }

          if (Array.isArray(value)) {
            return value.filter(Boolean).join(" ")
          }

          return String(value)
        }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configKey],
  )

  // Initialize and update MiniSearch instance synchronously
  const miniSearch = useMemo(() => {
    const instance = new MiniSearch<T>(stableConfig)
    if (data.length > 0) {
      try {
        instance.addAll(data)
      } catch (e) {
        if ((e as Error).message.includes("duplicate ID")) {
          // make the message a bit more descriptive to explain incorrect idField issue
          throw new Error(
            "Duplicate IDs detected in data, or incorrect idField supplied to useMiniSearch",
          )
        } else throw e
      }
    }
    miniSearchRef.current = instance
    return instance
  }, [stableConfig, data])

  // Compute search results during render - no state needed!
  const searchResults = useMemo(() => {
    if (searchValue.length === 0) {
      return data
    }

    const matches = miniSearch.search(searchValue, {
      prefix: true,
      ...searchOptions,
    })

    // Create a map of id to search score for sorting
    const scoreMap = new Map(matches.map((result) => [result.id, result.score]))

    // Filter and sort data by MiniSearch relevance scores
    return data
      .filter((item) => scoreMap.has(item[idField]))
      .sort((a, b) => {
        const scoreA = scoreMap.get(a[idField]) ?? 0
        const scoreB = scoreMap.get(b[idField]) ?? 0
        return scoreB - scoreA // Higher scores first
      })
  }, [data, searchValue, idField, searchOptions, miniSearch])

  const onSearchChange = useCallback((newValue: string) => {
    setSearchValue(newValue)
  }, [])

  const resetSearch = useCallback(() => {
    setSearchValue("")
  }, [])

  return {
    searchResults,
    searchValue,
    onSearchChange,
    resetSearch,
    isSearching: searchValue.length > 0,
  }
}
