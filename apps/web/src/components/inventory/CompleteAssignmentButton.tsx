import { Send, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"

type CompleteAssignmentButtonProps = {
  selectedCount: number
  onCompleteAssignment: () => void
  className?: string
}

export const CompleteAssignmentButton = ({
  selectedCount,
  onCompleteAssignment,
  className,
}: CompleteAssignmentButtonProps) => {
  return (
    <div className={`sticky bottom-4 flex justify-center ${className}`}>
      <Button
        onClick={onCompleteAssignment}
        size="xl"
        className="bg-primary hover:bg-primary/60 cursor-pointer gap-2 py-5 shadow-lg"
        disabled={selectedCount < 1}
      >
        <Send className="h-6 w-6" />
        <span className="text-xl">Send for Testing</span>
        <Badge variant="secondary" className="ml-1">
          <Package className="mr-1 h-3 w-3" />
          {selectedCount}
        </Badge>
      </Button>
    </div>
  )
}
