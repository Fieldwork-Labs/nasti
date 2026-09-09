import { useId, type ReactNode } from "react"

import { Checkbox } from "@nasti/ui/checkbox"
import { Label } from "@nasti/ui/label"
import { cn } from "@nasti/ui/utils"

export type CheckboxGroupOption<T extends string> = {
  value: T
  label: ReactNode
}

type CheckboxGroupProps<T extends string> = {
  options: readonly CheckboxGroupOption<T>[]
  value: readonly T[]
  onChange: (value: T[]) => void
  label?: ReactNode
  /** "lg" gives touch-sized targets for the field app. */
  size?: "default" | "lg"
  className?: string
}

export function CheckboxGroup<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "default",
  className,
}: CheckboxGroupProps<T>) {
  const groupId = useId()
  const isLarge = size === "lg"

  const toggle = (option: T, checked: boolean) => {
    // Keep the stored order stable so a re-order never reads as a change.
    onChange(
      options
        .map(({ value: optionValue }) => optionValue)
        .filter((optionValue) =>
          optionValue === option ? checked : value.includes(optionValue),
        ),
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label className={cn(isLarge && "text-lg")}>{label}</Label>}
      <div
        role="group"
        aria-label={typeof label === "string" ? label : undefined}
        className={cn(isLarge ? "space-y-1" : "space-y-2")}
      >
        {options.map((option) => {
          const id = `${groupId}-${option.value}`
          return (
            <div
              key={option.value}
              className={cn(
                "flex items-center space-x-2",
                isLarge && "min-h-12 space-x-3",
              )}
            >
              <Checkbox
                id={id}
                checked={value.includes(option.value)}
                onCheckedChange={(checked) =>
                  toggle(option.value, checked === true)
                }
                className={cn(isLarge && "h-6 w-6")}
              />
              <Label htmlFor={id} className={cn(isLarge && "text-lg")}>
                {option.label}
              </Label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
