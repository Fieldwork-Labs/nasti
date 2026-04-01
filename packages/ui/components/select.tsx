import * as React from "react"
import {
  Select as SelectPrimitive,
  SelectGroup as SelectGroupPrimitive,
  SelectValue as SelectValuePrimitive,
  type SelectValueProps,
  SelectTrigger as SelectTriggerPrimitive,
  SelectTriggerProps,
  SelectIcon as SelectIconPrimitive,
  SelectContent as SelectContentPrimitive,
  SelectPortal as SelectPortalPrimitive,
  SelectViewport as SelectViewportPrimitive,
  SelectLabel as SelectLabelPrimitive,
  SelectItem as SelectItemPrimitive,
  SelectItemIndicator as SelectItemIndicatorPrimitive,
  SelectItemText as SelectItemTextPrimitive,
  SelectSeparator as SelectSeparatorPrimitive,
  SelectScrollUpButton as SelectScrollUpButtonPrimitive,
  SelectScrollDownButton as SelectScrollDownButtonPrimitive,
} from "@radix-ui/react-select"

import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "lucide-react"
import { cn } from "../utils"

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive>) {
  return <SelectPrimitive data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectGroupPrimitive>) {
  return (
    <SelectGroupPrimitive
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  )
}

function SelectValue({ ...props }: SelectValueProps) {
  return <SelectValuePrimitive data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: SelectTriggerProps & {
  size?: "sm" | "default"
}) {
  return (
    <SelectTriggerPrimitive
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 focus-visible:ring-3 aria-invalid:ring-3 flex w-fit select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-lg border bg-transparent py-2 pl-2.5 pr-2 text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <SelectIconPrimitive asChild>
        <ChevronDownIcon className="text-muted-foreground pointer-events-none size-4" />
      </SelectIconPrimitive>
    </SelectTriggerPrimitive>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectContentPrimitive>) {
  return (
    <SelectPortalPrimitive>
      <SelectContentPrimitive
        data-slot="select-content"
        data-align-trigger={position === "item-aligned"}
        className={cn(
          "bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ring-foreground/10 max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) relative z-50 min-w-36 overflow-y-auto overflow-x-hidden rounded-lg shadow-md ring-1 duration-100 data-[align-trigger=true]:animate-none",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectViewportPrimitive
          data-position={position}
          className={cn(
            "data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:min-w-(--radix-select-trigger-width) data-[position=popper]:w-full",
            position === "popper" && "",
          )}
        >
          {children}
        </SelectViewportPrimitive>
        <SelectScrollDownButton />
      </SelectContentPrimitive>
    </SelectPortalPrimitive>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectLabelPrimitive>) {
  return (
    <SelectLabelPrimitive
      data-slot="select-label"
      className={cn("text-muted-foreground px-1.5 py-1 text-xs", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectItemPrimitive>) {
  return (
    <SelectItemPrimitive
      data-slot="select-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 outline-hidden data-disabled:pointer-events-none data-disabled:opacity-50 relative flex w-full cursor-default select-none items-center gap-1.5 rounded-md py-1 pl-1.5 pr-8 text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectItemIndicatorPrimitive>
          <CheckIcon className="pointer-events-none" />
        </SelectItemIndicatorPrimitive>
      </span>
      <SelectItemTextPrimitive>{children}</SelectItemTextPrimitive>
    </SelectItemPrimitive>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectSeparatorPrimitive>) {
  return (
    <SelectSeparatorPrimitive
      data-slot="select-separator"
      className={cn("bg-border pointer-events-none -mx-1 my-1 h-px", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectScrollUpButtonPrimitive>) {
  return (
    <SelectScrollUpButtonPrimitive
      data-slot="select-scroll-up-button"
      className={cn(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectScrollUpButtonPrimitive>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectScrollDownButtonPrimitive>) {
  return (
    <SelectScrollDownButtonPrimitive
      data-slot="select-scroll-down-button"
      className={cn(
        "bg-popover z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectScrollDownButtonPrimitive>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
