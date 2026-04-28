import { Button } from "@nasti/ui/button"
import { useToast } from "@nasti/ui/hooks"
import {
  Boxes,
  Check,
  Loader2,
  Merge,
  Microscope,
  Package,
  Split,
} from "lucide-react"
import { useState } from "react"

import type { SubBatchWithStorage } from "@/hooks/useSubBatches"
import { useMergeSubBatches, useSubBatches } from "@/hooks/useSubBatches"
import { cn } from "@nasti/ui/utils"

/**
 * Displays sub-batches for a batch with merge capability and per-sub-batch storage moves
 */
export const SubBatchesTable = ({
  batchId,
  onStorageMove,
  onSubBatchSplit,
  onSubBatchQualityTest,
}: {
  batchId: string
  onStorageMove?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
}) => {
  const { toast } = useToast()
  const { data: subBatches, isLoading } = useSubBatches(batchId)
  const mergeMutation = useMergeSubBatches()
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [isMerging, setIsMerging] = useState(false)

  const toggleMergeSelect = (id: string) => {
    setSelectedForMerge((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  const handleMerge = async () => {
    if (selectedForMerge.length < 2) return
    try {
      await mergeMutation.mutateAsync({ subBatchIds: selectedForMerge })
      toast({ description: "Sub-batches merged successfully" })
      setSelectedForMerge([])
    } catch (error) {
      toast({
        description: "Failed to merge sub-batches",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-2 rounded-sm border border-gray-400 p-2">
        <div className="h-4 w-1/4 rounded bg-gray-200" />
      </div>
    )
  }

  if (!subBatches || subBatches.length < 1) return null

  return (
    <div className="flex flex-col gap-2 rounded-sm border border-gray-400 p-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          Sub-batches ({subBatches.length})
        </span>
        <div className="flex gap-1">
          {isMerging && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 cursor-pointer text-xs"
                disabled={
                  selectedForMerge.length < 2 || mergeMutation.isPending
                }
                onClick={handleMerge}
              >
                {mergeMutation.isPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Check className="mr-1 h-3 w-3" />
                )}
                Merge ({selectedForMerge.length})
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 cursor-pointer text-xs"
                onClick={() => {
                  setSelectedForMerge([])
                  setIsMerging(false)
                }}
              >
                Cancel
              </Button>
            </>
          )}
          {!isMerging && subBatches.length > 1 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 cursor-pointer text-xs"
              onClick={() => setIsMerging(true)}
            >
              <Merge className="mr-1 h-3 w-3" />
              Merge
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1">
        {subBatches.map((sb: SubBatchWithStorage) => (
          <SubBatchesTableRow
            key={sb.id}
            sb={sb}
            isMerging={isMerging}
            selectedForMerge={selectedForMerge}
            toggleMergeSelect={toggleMergeSelect}
            onSubBatchQualityTest={onSubBatchQualityTest}
            onSubBatchSplit={onSubBatchSplit}
            onStorageMove={onStorageMove}
          />
        ))}
      </div>
    </div>
  )
}

type SubBatchesTableRowProps = {
  sb: SubBatchWithStorage
  isMerging: boolean
  selectedForMerge: string[]
  toggleMergeSelect: (id: string) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onStorageMove?: (subBatchId: string) => void
}

const SubBatchesTableRow = ({
  sb,
  isMerging,
  selectedForMerge,
  toggleMergeSelect,
  onSubBatchQualityTest,
  onSubBatchSplit,
  onStorageMove,
}: SubBatchesTableRowProps) => {
  return (
    <div
      key={sb.id}
      className={cn(
        "flex items-center justify-between rounded px-2 py-1 text-xs",
        isMerging && "hover:bg-muted/50 cursor-pointer",
        selectedForMerge.includes(sb.id) &&
          "bg-primary/10 border-primary border",
      )}
      onClick={() => {
        if (isMerging) toggleMergeSelect(sb.id)
      }}
    >
      <div className="flex items-center gap-3">
        {isMerging && (
          <input
            type="checkbox"
            checked={selectedForMerge.includes(sb.id)}
            onChange={() => toggleMergeSelect(sb.id)}
            className="h-3 w-3"
          />
        )}
        <span className="font-mono font-medium">{sb.current_weight}g</span>
        {sb.current_storage?.location && (
          <span className="text-muted-foreground flex items-center gap-1">
            <Package className="h-3 w-3" />
            {sb.current_storage.location.name}
          </span>
        )}
        {sb.notes && <span className="text-muted-foreground">{sb.notes}</span>}
      </div>
      {!isMerging && (
        <div>
          {onSubBatchQualityTest && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 cursor-pointer p-0"
              onClick={(e) => {
                e.stopPropagation()
                onSubBatchQualityTest?.(sb.id)
              }}
              title="Quality Test"
            >
              <Microscope className="h-4 w-5" />
            </Button>
          )}
          {onSubBatchSplit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 cursor-pointer p-0"
              onClick={(e) => {
                e.stopPropagation()
                onSubBatchSplit?.(sb.id)
              }}
              title="Split"
            >
              <Split className="h-4 w-5" />
            </Button>
          )}
          {onStorageMove && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 cursor-pointer p-0"
              onClick={(e) => {
                e.stopPropagation()
                onStorageMove(sb.id)
              }}
              title="Move to storage"
            >
              <Boxes className="h-4 w-5" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
