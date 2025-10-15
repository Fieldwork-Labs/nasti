import { useEffect, useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Edit,
  Trash2,
  Split,
  Merge,
  MapPin,
  Calendar,
  Package,
  Leaf,
  Plus,
  Minus,
  X,
  ShoppingBag,
} from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"
import { useOpenClose, useToast } from "@nasti/ui/hooks"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@nasti/ui/alert-dialog"

import type { BatchWithCurrentLocationAndSpecies } from "../../hooks/useBatches"
import { useBatchDetail } from "../../hooks/useBatches"
import { useCurrentBatchStorage } from "../../hooks/useBatchStorage"
import { cn } from "@nasti/ui/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nasti/ui/tooltip"
import { CollectionListItem } from "../collections/CollectionListItem"
import { CollectionDetailModal } from "../collections/CollectionDetailModal"

type BatchTableRowProps = {
  batch: BatchWithCurrentLocationAndSpecies
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onStorageMove?: (batch: BatchWithCurrentLocationAndSpecies) => void
  className?: string
  mergeMode?: {
    isActive: boolean
    isInitiating: boolean
    isSelected: boolean
    canMerge: boolean
    onAddToMerge: () => void
    onRemoveFromMerge: () => void
    onCancelMerge: () => void
  }
}

const BatchCollectionField = ({
  batch,
}: {
  batch: BatchWithCurrentLocationAndSpecies
}) => {
  const { open, isOpen, close } = useOpenClose()
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-blue-600" />
              <span className="font-mono text-sm">{batch.collection.code}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="p-0">
            <CollectionListItem id={batch.collection_id} onClick={open} />
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <CollectionDetailModal
        id={batch.collection_id}
        open={isOpen}
        onClose={close}
      />
    </>
  )
}

export const BatchTableRow = ({
  batch,
  onEdit,
  onDelete,
  onSplit,
  onMerge,
  onStorageMove,
  className,
  mergeMode,
}: BatchTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { toast } = useToast()

  const { data: _, isLoading: detailLoading } = useBatchDetail(batch.id)
  const { data: currentStorage } = useCurrentBatchStorage(batch.id)

  useEffect(() => {
    if (mergeMode?.isActive) setIsExpanded(false)
  }, [mergeMode?.isActive])

  const handleDelete = () => {
    onDelete?.(batch.id)
    toast({
      description: "Batch deleted successfully",
    })
  }

  // need a special value to represent when mergemode is active but this row is not mergeable
  const mergeDisabled = Boolean(mergeMode && !mergeMode.canMerge)

  return (
    <>
      {/* Main Row */}
      <tr
        className={cn(
          "hover:bg-muted/50 cursor-pointer border-b transition-colors",
          mergeMode?.isSelected &&
            mergeMode?.canMerge &&
            "bg-accent/20 border-accent/40",
          mergeDisabled &&
            "bg-muted-foreground/20 text-primary-foreground/40 border-transparent",

          mergeMode?.isInitiating && "bg-accent/40 border-accent/60",
          className,
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded(!isExpanded)
              }}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
            <span className="font-mono text-sm">{batch.id.slice(0, 8)}...</span>
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {batch.species && <Leaf className="h-4 w-4 text-green-600" />}
            <span className="w-56 truncate text-sm">
              {batch.species?.name || batch.collection?.field_name}
            </span>
          </div>
        </td>

        <td className="px-4 py-3">
          <BatchCollectionField batch={batch} />
        </td>

        <td className="px-4 py-3">
          {currentStorage ? (
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-orange-600" />
              <span className="text-sm">{currentStorage.location?.name}</span>
            </div>
          ) : (
            <Badge variant="outline" className="text-xs">
              Not stored
            </Badge>
          )}
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span className="text-sm">
              {new Date(batch.created_at || "").toLocaleDateString()}
            </span>
          </div>
        </td>

        <td className="px-4 py-3">
          {/* button style container only */}
          <div className="[&_button]:h-8 [&_button]:cursor-pointer [&_button]:px-1">
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {mergeMode?.canMerge && mergeMode?.isActive ? (
                // Merge mode actions
                <>
                  {mergeMode.isInitiating ? (
                    // Initiating batch shows cancel merge button
                    <Button
                      variant="outline"
                      size={"lg"}
                      onClick={mergeMode.onCancelMerge}
                      className="text-destructive border-destructive/50 hover:bg-destructive/50"
                    >
                      <X className="mr-1 h-4 w-4" />
                      <span className="text-xs">Cancel Merge</span>
                    </Button>
                  ) : (
                    // Other batches show add/remove from merge buttons
                    <>
                      {mergeMode.isSelected ? (
                        <Button
                          variant="outline"
                          onClick={mergeMode.onRemoveFromMerge}
                          className="text-accent-foreground border-accent bg-accent/20"
                        >
                          <Minus className="mr-1 h-4 w-4" />
                          <span className="text-xs">Remove</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={mergeMode.onAddToMerge}
                          className="text-primary border-primary/20 hover:bg-primary/10"
                        >
                          <Plus className="mr-1 h-4 w-4" />
                          <span className="text-xs">Add to Merge</span>
                        </Button>
                      )}
                    </>
                  )}
                </>
              ) : (
                // Normal mode actions
                <>
                  <Button
                    variant="ghost"
                    disabled={mergeDisabled}
                    size="sm"
                    onClick={() => onEdit?.(batch)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mergeDisabled}
                    onClick={() => onSplit?.(batch)}
                  >
                    <Split className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mergeDisabled}
                    onClick={() => onMerge?.(batch)}
                  >
                    <Merge className="h-4 w-4" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={mergeDisabled}
                    onClick={() => onStorageMove?.(batch)}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mergeDisabled}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Batch</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this batch? This
                          action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          </div>
        </td>
      </tr>

      {/* Expanded Details Row */}
      {isExpanded && (
        <tr className="bg-muted/25 border-b">
          <td colSpan={6} className="px-4 py-4">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold">Batch Details</h4>

              {detailLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-1/4 rounded bg-gray-200"></div>
                  <div className="h-4 w-1/3 rounded bg-gray-200"></div>
                  <div className="h-4 w-1/2 rounded bg-gray-200"></div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <span className="font-medium">Batch ID:</span>
                    <div className="mt-1 font-mono text-xs">{batch.id}</div>
                  </div>

                  <div>
                    <span className="font-medium">Collection ID:</span>
                    <div className="mt-1 font-mono text-xs">
                      {batch.collection_id}
                    </div>
                  </div>

                  {batch.notes && (
                    <div className="md:col-span-2 lg:col-span-3">
                      <span className="font-medium">Notes:</span>
                      <div className="text-muted-foreground mt-1 text-xs">
                        {batch.notes}
                      </div>
                    </div>
                  )}

                  {currentStorage && (
                    <div>
                      <span className="font-medium">Storage Location:</span>
                      <div className="mt-1 text-xs">
                        {currentStorage.location?.name}
                        {currentStorage.stored_at && (
                          <div className="text-muted-foreground">
                            Stored:{" "}
                            {new Date(
                              currentStorage.stored_at,
                            ).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TODO: Add more detailed information here in the future */}
              <div className="border-t pt-2">
                <div className="text-muted-foreground text-xs">
                  TODO: Advanced batch details (lineage, treatments, tests,
                  etc.) will be displayed here
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
