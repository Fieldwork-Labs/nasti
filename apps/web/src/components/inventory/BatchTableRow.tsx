import { useState } from "react"
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
} from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Badge } from "@nasti/ui/badge"
import { useToast } from "@nasti/ui/hooks"
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

type BatchTableRowProps = {
  batch: BatchWithCurrentLocationAndSpecies
  onEdit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onDelete?: (batchId: string) => void
  onSplit?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onMerge?: (batch: BatchWithCurrentLocationAndSpecies) => void
  onStorageMove?: (batch: BatchWithCurrentLocationAndSpecies) => void
  className?: string
}

export const BatchTableRow = ({
  batch,
  onEdit,
  onDelete,
  onSplit,
  onMerge,
  onStorageMove,
  className,
}: BatchTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { toast } = useToast()

  const { data: _, isLoading: detailLoading } = useBatchDetail(batch.id)
  const { data: currentStorage } = useCurrentBatchStorage(batch.id)

  const handleDelete = () => {
    onDelete?.(batch.id)
    toast({
      description: "Batch deleted successfully",
    })
  }

  return (
    <>
      {/* Main Row */}
      <tr
        className={`hover:bg-muted/50 cursor-pointer border-b transition-colors ${className}`}
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
            <Leaf className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              {batch.species?.name || batch.collection?.field_name}
            </span>
          </div>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" />
            <span className="font-mono text-sm">
              {batch.collection_id.slice(0, 8)}...
            </span>
          </div>
        </td>

        <td className="px-4 py-3">
          {currentStorage ? (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-600" />
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
          <div className="[&_button]:h-8 [&_button]:w-8 [&_button]:cursor-pointer [&_button]:p-0">
            <div
              className="flex items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Button variant="ghost" size="sm" onClick={() => onEdit?.(batch)}>
                <Edit className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSplit?.(batch)}
              >
                <Split className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onMerge?.(batch)}
              >
                <Merge className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => onStorageMove?.(batch)}
              >
                <MapPin className="h-4 w-4" />
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Batch</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this batch? This action
                      cannot be undone.
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
