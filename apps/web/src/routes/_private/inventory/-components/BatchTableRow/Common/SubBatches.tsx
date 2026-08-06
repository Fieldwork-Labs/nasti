import { Button } from "@nasti/ui/button"
import {
  Box,
  Boxes,
  Merge,
  Microscope,
  Package,
  ShoppingBasket,
  Split,
} from "lucide-react"
import { useState } from "react"

import { SubBatchMergeModal } from "@/components/batches/SubBatchMergeModal"
import type { SubBatchWithStorage } from "@/hooks/useSubBatches"
import { useSubBatches } from "@/hooks/useSubBatches"
import useBagBasketStore from "@/store/bagBasketStore"
import { cn } from "@nasti/ui/utils"

/**
 * Displays sub-batches for a batch with merge capability and per-sub-batch storage moves
 */
export const SubBatchesTable = ({
  batchId,
  batchCode,
  assignedBagIds,
  onStorageMove,
  onSubBatchSplit,
  onSubBatchQualityTest,
}: {
  batchId: string
  /** Carried into the basket so it can label a bag without another query. */
  batchCode?: string | null
  /** Bags already out at a laboratory; they cannot be picked again. */
  assignedBagIds?: Set<string>
  onStorageMove?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
}) => {
  const { data: subBatches, isLoading } = useSubBatches(batchId)
  const isSelecting = useBagBasketStore((state) => state.isSelecting)
  const [selectedForMerge, setSelectedForMerge] = useState<string[]>([])
  const [isMerging, setIsMerging] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)

  const toggleMergeSelect = (id: string) => {
    setSelectedForMerge((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  const handleMerge = () => {
    if (selectedForMerge.length < 2) return
    setShowMergeModal(true)
  }

  const selectedSubBatches =
    subBatches?.filter((subBatch) => selectedForMerge.includes(subBatch.id)) ??
    []

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
        <span className="text-sm font-medium">Bags ({subBatches.length})</span>
        <div className="flex gap-1">
          {isMerging && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-6 cursor-pointer text-xs"
                disabled={selectedForMerge.length < 2}
                onClick={handleMerge}
              >
                <Merge className="mr-1 h-3 w-3" />
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
            batchId={batchId}
            batchCode={batchCode ?? null}
            isMerging={isMerging}
            isSelecting={isSelecting}
            isAlreadyAssigned={Boolean(assignedBagIds?.has(sb.id))}
            selectedForMerge={selectedForMerge}
            toggleMergeSelect={toggleMergeSelect}
            onSubBatchQualityTest={onSubBatchQualityTest}
            onSubBatchSplit={onSubBatchSplit}
            onStorageMove={onStorageMove}
          />
        ))}
      </div>
      {showMergeModal && (
        <SubBatchMergeModal
          isOpen
          onClose={() => setShowMergeModal(false)}
          onSuccess={() => {
            setShowMergeModal(false)
            setSelectedForMerge([])
            setIsMerging(false)
          }}
          subBatches={selectedSubBatches}
        />
      )}
    </div>
  )
}

type SubBatchesTableRowProps = {
  sb: SubBatchWithStorage
  batchId: string
  batchCode: string | null
  isMerging: boolean
  isSelecting: boolean
  isAlreadyAssigned: boolean
  selectedForMerge: string[]
  toggleMergeSelect: (id: string) => void
  onSubBatchQualityTest?: (subBatchId: string) => void
  onSubBatchSplit?: (subBatchId: string) => void
  onStorageMove?: (subBatchId: string) => void
}

const SubBatchesTableRow = ({
  sb,
  batchId,
  batchCode,
  isMerging,
  isSelecting,
  isAlreadyAssigned,
  selectedForMerge,
  toggleMergeSelect,
  onSubBatchQualityTest,
  onSubBatchSplit,
  onStorageMove,
}: SubBatchesTableRowProps) => {
  const toggleBag = useBagBasketStore((state) => state.toggleBag)
  const isInBasket = useBagBasketStore((state) => state.bags.has(sb.id))

  // A bag already out at a laboratory cannot be sent again, and one with no
  // seed left has nothing to send.
  const isSelectable =
    isSelecting && !isAlreadyAssigned && (sb.current_weight ?? 0) > 0

  const addToBasket = () =>
    toggleBag({
      subBatchId: sb.id,
      batchId,
      batchCode,
      containerName: sb.container?.name ?? null,
      weightGrams: Number(sb.current_weight ?? 0),
    })

  return (
    <div
      key={sb.id}
      className={cn(
        "flex items-center justify-between rounded px-2 py-1 text-xs",
        isMerging && "hover:bg-muted/50 cursor-pointer",
        selectedForMerge.includes(sb.id) &&
          "bg-primary/10 border-primary border",
        isSelectable && "hover:bg-muted/50 cursor-pointer",
        isInBasket && "bg-primary/10 border-primary border",
        isSelecting && !isSelectable && "opacity-50",
      )}
      onClick={() => {
        if (isMerging) toggleMergeSelect(sb.id)
        else if (isSelectable) addToBasket()
      }}
    >
      <div className="flex items-center gap-3">
        {isMerging && (
          <input
            type="checkbox"
            checked={selectedForMerge.includes(sb.id)}
            onChange={() => toggleMergeSelect(sb.id)}
            onClick={(event) => event.stopPropagation()}
            className="h-3 w-3"
          />
        )}
        {isSelecting && !isMerging && (
          <input
            type="checkbox"
            checked={isInBasket}
            disabled={!isSelectable}
            onChange={addToBasket}
            onClick={(event) => event.stopPropagation()}
            className="h-3 w-3"
          />
        )}
        <span className="font-mono font-medium">{sb.current_weight}g</span>
        {sb.container && (
          <span className="text-muted-foreground flex items-center gap-1">
            <Box className="h-3 w-3" />
            {sb.container.name}
          </span>
        )}
        {sb.current_storage?.location && (
          <span className="text-muted-foreground flex items-center gap-1">
            <Package className="h-3 w-3" />
            {sb.current_storage.location.name}
          </span>
        )}
        {sb.notes && <span className="text-muted-foreground">{sb.notes}</span>}
        {isSelecting && isAlreadyAssigned && (
          <span className="text-muted-foreground flex items-center gap-1">
            <ShoppingBasket className="h-3 w-3" />
            Already out for testing
          </span>
        )}
      </div>
      {!isMerging && !isSelecting && (
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
