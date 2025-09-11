import { useState } from "react"
import { Plus, MapPin, Edit, Trash2, Package } from "lucide-react"
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"

import {
  useStorageLocations,
  useDeleteStorageLocation,
} from "../../hooks/useBatchStorage"
import { StorageLocationForm } from "./StorageLocationForm"
import type { StorageLocation } from "@nasti/common/types"

type StorageLocationsListProps = {
  className?: string
}

export const StorageLocationsList = ({
  className,
}: StorageLocationsListProps) => {
  const { data: storageLocations, isLoading } = useStorageLocations()
  const deleteStorageLocation = useDeleteStorageLocation()
  const { toast } = useToast()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingLocation, setEditingLocation] =
    useState<StorageLocation | null>(null)
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(
    null,
  )

  const handleDelete = async (locationId: string) => {
    try {
      await deleteStorageLocation.mutateAsync(locationId)
      toast({
        description: "Storage location deleted successfully",
      })
      setDeletingLocationId(null)
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete storage location",
      })
    }
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    toast({
      description: "Storage location created successfully",
    })
  }

  const handleEditSuccess = () => {
    setEditingLocation(null)
    toast({
      description: "Storage location updated successfully",
    })
  }

  if (isLoading) {
    return (
      <div className={className}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Storage Locations</h2>
            <p className="text-muted-foreground">
              Manage your seed storage locations
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="animate-pulse">
                <div className="mb-2 h-4 w-1/2 rounded bg-gray-200"></div>
                <div className="h-3 w-3/4 rounded bg-gray-200"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Storage Locations</h2>
          <p className="text-muted-foreground">
            Manage your seed storage locations and track batch movements
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Location
        </Button>
      </div>

      {!storageLocations?.length ? (
        <Card className="p-8 text-center">
          <MapPin className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">No Storage Locations</h3>
          <p className="text-muted-foreground mb-4">
            Create your first storage location to start tracking batch movements
          </p>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Location
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {storageLocations.map((location) => (
            <Card
              key={location.id}
              className="p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-blue-500" />
                    <h3 className="text-lg font-semibold">{location.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLocation(location)}
                    >
                      <Edit className="h-4 w-4" />
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
                          <AlertDialogTitle>
                            Delete Storage Location
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete "{location.name}"?
                            This action cannot be undone.
                            {/* Add batch count warning if we had that data */}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(location.id)}
                            className="bg-red-600 hover:bg-red-700"
                            disabled={deleteStorageLocation.isPending}
                          >
                            {deleteStorageLocation.isPending &&
                            deletingLocationId === location.id
                              ? "Deleting..."
                              : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {location.description && (
                  <p className="text-muted-foreground mb-3 flex-1 text-sm">
                    {location.description}
                  </p>
                )}

                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Package className="h-4 w-4" />
                  <span>Storage location</span>
                </div>

                <div className="text-muted-foreground mt-3 border-t pt-3 text-xs">
                  Created:{" "}
                  {new Date(location.created_at || "").toLocaleDateString()}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Location Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Storage Location</DialogTitle>
          </DialogHeader>
          <StorageLocationForm
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowCreateModal(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Location Modal */}
      <Dialog
        open={Boolean(editingLocation)}
        onOpenChange={() => setEditingLocation(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Storage Location</DialogTitle>
          </DialogHeader>
          {editingLocation && (
            <StorageLocationForm
              instance={editingLocation}
              onSuccess={handleEditSuccess}
              onCancel={() => setEditingLocation(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
