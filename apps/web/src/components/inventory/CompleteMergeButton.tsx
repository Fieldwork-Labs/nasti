import { Merge, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"

type CompleteMergeButtonProps = {
  selectedCount: number
  onCompleteMerge: () => void
  className?: string
}

export const CompleteMergeButton = ({
  selectedCount,
  onCompleteMerge,
  className,
}: CompleteMergeButtonProps) => {
  return (
    <div className={`sticky bottom-4 flex justify-center ${className}`}>
      <Button
        onClick={onCompleteMerge}
        size="xl"
        className="cursor-pointer gap-2 py-5 shadow-lg"
        disabled={selectedCount < 2}
      >
        <Merge className="h-6 w-6" />
        <span className="text-xl">Complete Merge</span>
        <Badge variant="secondary" className="ml-1">
          <Package className="mr-1 h-3 w-3" />
          {selectedCount}
        </Badge>
      </Button>
    </div>
  )
}
