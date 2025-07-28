import React, { forwardRef } from "react"
import { SearchIcon, X } from "lucide-react"
import { cn } from "../utils"
import { Spinner } from "./spinner"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string
}

interface SearchInputProps extends Omit<InputProps, "type"> {
  onClear?: () => void
  onValueChange?: (value: string) => void
  isSearching?: boolean
  showClearButton?: boolean
}

const Search = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      onClear,
      onChange,
      onValueChange,
      isSearching,
      showClearButton = true,
      value = "", // Default to empty string if no value provided
      ...props
    },
    ref,
  ) => {
    const handleClear = () => {
      onClear?.()
      // If there's an onChange handler, call it with empty value
      if (onChange) {
        const syntheticEvent = {
          target: { value: "" },
          currentTarget: { value: "" },
        } as React.ChangeEvent<HTMLInputElement>
        onChange(syntheticEvent)
      }
      onValueChange?.("")
    }

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onChange) onChange(e)
      onValueChange?.(e.target.value)
    }

    const showClear = showClearButton && value && String(value).length > 0

    return (
      <div className="relative flex items-center">
        {/* Search Icon */}
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute left-3 h-4 w-4"
          aria-hidden="true"
        />

        {/* Input Field */}
        <input
          type="text"
          className={cn(
            "border-input bg-secondary-background ring-offset-background file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:outline-hidden flex h-10 w-full rounded-md border py-2 pl-10 pr-10 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          ref={ref}
          value={value}
          onChange={handleChange}
          {...props}
        />

        {/* Clear Button */}
        {showClear && !isSearching && (
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground absolute right-3 h-4 w-4 cursor-pointer focus:outline-none"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isSearching && (
          <div className="pointer-events-none absolute right-3 flex items-center">
            <Spinner className="size-4" />
          </div>
        )}
      </div>
    )
  },
)

export { Search }
