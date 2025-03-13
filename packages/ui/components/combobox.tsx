import * as React from "react"
import {
  Combobox as HeadlessCombobox,
  ComboboxInput as HeadlessComboboxInput,
  ComboboxOptions as HeadlessComboboxOptions,
  ComboboxOption as HeadlessComboboxOption,
} from "@headlessui/react"
import { cn } from "@nasti/ui/utils"
export { type ComboboxProps } from "@headlessui/react"

const Combobox = HeadlessCombobox

const ComboboxInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof HeadlessComboboxInput>
>(({ className, ...props }, ref) => (
  <HeadlessComboboxInput
    ref={ref}
    className={cn(
      "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring focus:outline-hidden flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
))

const ComboboxOptions = React.forwardRef<
  HTMLUListElement,
  React.ComponentPropsWithoutRef<typeof HeadlessComboboxOptions>
>(({ className, ...props }, ref) => (
  <HeadlessComboboxOptions
    ref={ref}
    className={cn(
      "bg-background/90 z-100 pointer-events-auto w-[var(--input-width)] rounded-xl border border-white/50 p-1 [--anchor-gap:var(--spacing-1)] empty:invisible",
      "data-leave:data-closed:opacity-0 transition duration-100 ease-in",
      className,
    )}
    {...props}
  />
))

const ComboboxOption = React.forwardRef<
  React.ElementRef<typeof HeadlessComboboxOption>,
  React.ComponentPropsWithoutRef<typeof HeadlessComboboxOption>
>(({ className, ...props }, ref) => (
  <HeadlessComboboxOption
    ref={ref}
    className={cn(
      "data-focus:bg-secondary-background data-focus:text-secondary-foreground outline-hidden flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm transition-colors",
      className,
    )}
    {...props}
  />
))
ComboboxOption.displayName = "ComboboxOption"

// Export the components
export { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption }
