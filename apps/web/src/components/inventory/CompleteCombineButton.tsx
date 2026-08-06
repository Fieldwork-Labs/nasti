import { Combine, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"

type CompleteCombineButtonProps = {
  selectedCount: number
  onCompleteCombine: () => void
  className?: string
}

export const CompleteCombineButton = ({
  selectedCount,
  onCompleteCombine,
  className,
}: CompleteCombineButtonProps) => {
  return (
    <div className={`sticky bottom-4 flex justify-center ${className}`}>
      <Button
        onClick={onCompleteCombine}
        size="xl"
        className="cursor-pointer gap-2 py-5 shadow-lg"
        disabled={selectedCount < 2}
      >
        <Combine className="h-6 w-6" />
        <span className="text-xl">Complete Combine</span>
        <Badge variant="secondary" className="ml-1">
          <Package className="mr-1 h-3 w-3" />
          {selectedCount}
        </Badge>
      </Button>
    </div>
  )
}
