import * as React from "react"
import {
  Combobox as HeadlessCombobox,
  ComboboxInput as HeadlessComboboxInput,
  ComboboxOptions as HeadlessComboboxOptions,
  ComboboxOption as HeadlessComboboxOption,
} from "@headlessui/react"
import { cn } from "@/lib/utils"
export { type ComboboxProps } from "@headlessui/react"

const Combobox = HeadlessCombobox

const ComboboxInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof HeadlessComboboxInput>
>(({ className, ...props }, ref) => (
  <HeadlessComboboxInput
    ref={ref}
    className={cn(
      "border-input bg-background ring-offset-background placeholder:text-muted-foreground focus:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
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
      "bg-background/90 pointer-events-auto z-[100] w-[var(--input-width)] rounded-xl border border-white/50 p-1 [--anchor-gap:var(--spacing-1)] empty:invisible",
      "transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0",
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
      "data-[focus]:bg-secondary-background data-[focus]:text-secondary-foreground flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
      className,
    )}
    {...props}
  />
))
ComboboxOption.displayName = "ComboboxOption"

// Export the components
export { Combobox, ComboboxInput, ComboboxOptions, ComboboxOption }
