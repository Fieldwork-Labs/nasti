import { Button } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import { ChevronRight } from "lucide-react"
import { useState, type ReactNode } from "react"

type ExtraFieldsAccordionProps = {
  children: ReactNode
}

export const ExtraFieldsAccordion = ({
  children,
}: ExtraFieldsAccordionProps) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section className="border-y">
      <Button
        type="button"
        variant="ghost"
        className="flex h-12 w-full items-center justify-between px-0 text-lg"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span>Extra Fields</span>
        <ChevronRight
          className={cn("h-5 w-5 transition-transform", isOpen && "rotate-90")}
        />
      </Button>
      {isOpen && <div className="space-y-4 pb-4">{children}</div>}
    </section>
  )
}
