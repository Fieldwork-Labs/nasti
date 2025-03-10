import { Link, LinkProps } from "@tanstack/react-router"
import { Button, ButtonProps } from "./button"

export const ButtonLink = (
  props: LinkProps &
    Pick<ButtonProps, "className" | "size" | "title" | "variant"> & {
      className?: string
    },
) => {
  const { className, size, title, variant } = props
  return (
    <Button
      className={className}
      size={size}
      title={title}
      variant={variant}
      asChild
    >
      <Link {...props}>{props.children}</Link>
    </Button>
  )
}
