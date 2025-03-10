import {
  forwardRef,
  type DetailedHTMLProps,
  type InputHTMLAttributes,
} from "react"
import type { FieldError } from "react-hook-form"
import { cn } from "@nasti/utils"
import { Label } from "./label"
import { Input } from "./input"

type FormFieldProps = {
  label: string | JSX.Element
  error?: FieldError
} & DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ error, label, ...fieldProps }: FormFieldProps, ref) => (
    <div className="form-group flex flex-col gap-2">
      <div className="grid w-full items-center gap-1.5">
        <Label htmlFor={fieldProps.name}>{label}</Label>
        <Input
          {...fieldProps}
          ref={ref}
          className={cn(
            error &&
              "border-orange-800 focus:border-orange-500 focus:ring-orange-600",
          )}
        />
        {error && (
          <div className="flex h-4 justify-end text-xs text-orange-800">
            {error.message}
          </div>
        )}
        {!error && <span className="h-4" />}
      </div>
    </div>
  ),
)
