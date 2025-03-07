import { Input } from "@nasti/ui/input"
import { Label } from "@nasti/ui/label"

export function InputWithLabel(
  props: JSX.IntrinsicElements["input"] & { title: string },
) {
  return (
    <div className="grid w-full max-w-sm items-center gap-1.5">
      <Label htmlFor={props.name}>{props.title}</Label>
      <Input {...props} />
    </div>
  )
}
