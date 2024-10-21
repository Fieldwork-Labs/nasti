import { Link, LinkProps } from "@tanstack/react-router"
import { Button } from "./button"

export const ButtonLink = (props: LinkProps & { className?: string }) => {
  const { className } = props
  return (
    <Button className={className} asChild>
      <Link {...props}>{props.children}</Link>
    </Button>
  )
}
