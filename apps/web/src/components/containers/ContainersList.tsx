import {
  CONTAINER_PURPOSES,
  CONTAINER_PURPOSE_LABELS,
  type Container,
  type ContainerPurpose,
} from "@nasti/common/types"
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
import { Badge } from "@nasti/ui/badge"
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@nasti/ui/dialog"
import { useToast } from "@nasti/ui/hooks"
import { Switch } from "@nasti/ui/switch"
import { Box, Edit, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"

import {
  useContainerUsage,
  useContainers,
  useDeleteContainer,
  useUpdateContainer,
} from "@/hooks/useContainers"
import { ContainerForm } from "./ContainerForm"

const PURPOSE_DESCRIPTIONS: Record<ContainerPurpose, string> = {
  collection: "Used in the field to collect seed",
  storage: "Used to store seed after processing",
}

type ContainersListProps = {
  className?: string
}

export const ContainersList = ({ className }: ContainersListProps) => {
  const { data: containers, isLoading } = useContainers()
  const { data: usage, isLoading: usageLoading } = useContainerUsage()
  const updateContainer = useUpdateContainer()
  const deleteContainer = useDeleteContainer()
  const { toast } = useToast()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingContainer, setEditingContainer] = useState<Container | null>(
    null,
  )

  const containersByPurpose = useMemo(
    () =>
      CONTAINER_PURPOSES.map((purpose) => ({
        purpose,
        containers:
          containers?.filter((container) => container.purpose === purpose) ??
          [],
      })),
    [containers],
  )

  const handleToggleActive = async (container: Container) => {
    try {
      await updateContainer.mutateAsync({
        id: container.id,
        active: !container.active,
      })
      toast({
        description: `${container.name} is now ${container.active ? "inactive" : "active"}`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to update container",
      })
    }
  }

  const handleDelete = async (container: Container) => {
    try {
      await deleteContainer.mutateAsync(container.id)
      toast({ description: `${container.name} deleted` })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to delete container",
      })
    }
  }

  const header = (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold">Containers</h2>
        <p className="text-muted-foreground">
          Manage the containers your organisation collects and stores seed in
        </p>
      </div>
      <Button onClick={() => setShowCreateModal(true)} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Container
      </Button>
    </div>
  )

  if (isLoading) {
    return (
      <div className={className}>
        {header}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="animate-pulse">
                <div className="mb-2 h-4 w-1/2 rounded bg-gray-200" />
                <div className="h-3 w-3/4 rounded bg-gray-200" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      {header}

      {!containers?.length ? (
        <Card className="p-8 text-center">
          <Box className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">No Containers</h3>
          <p className="text-muted-foreground mb-4">
            Add the buckets, bags and envelopes your organisation uses so
            collectors can record what seed went into
          </p>
          <Button onClick={() => setShowCreateModal(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Your First Container
          </Button>
        </Card>
      ) : (
        <div className="space-y-8">
          {containersByPurpose.map(({ purpose, containers: group }) => (
            <div key={purpose}>
              <div className="mb-3">
                <h3 className="text-lg font-semibold">
                  {CONTAINER_PURPOSE_LABELS[purpose]}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {PURPOSE_DESCRIPTIONS[purpose]}
                </p>
              </div>
              {group.length === 0 ? (
                <p className="text-muted-foreground text-sm italic">
                  No {CONTAINER_PURPOSE_LABELS[purpose].toLowerCase()}{" "}
                  containers yet
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.map((container) => {
                    const containerUsage = usage?.[container.id] ?? {
                      collectionCount: 0,
                      storageSubBatchCount: 0,
                      totalCount: 0,
                    }
                    const usageParts = [
                      containerUsage.collectionCount > 0 &&
                        `${containerUsage.collectionCount} collection${containerUsage.collectionCount === 1 ? "" : "s"}`,
                      containerUsage.storageSubBatchCount > 0 &&
                        `${containerUsage.storageSubBatchCount} storage sub-batch${containerUsage.storageSubBatchCount === 1 ? "" : "es"}`,
                    ].filter(Boolean)
                    const usageDescription = usageParts.join(" and ")

                    return (
                      <Card key={container.id} className="p-4">
                        <div className="flex h-full flex-col gap-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Box className="h-5 w-5 shrink-0 text-blue-500" />
                              <h4 className="font-semibold">
                                {container.name}
                              </h4>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Edit ${container.name}`}
                                onClick={() => setEditingContainer(container)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    aria-label={`Delete ${container.name}`}
                                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete Container
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {usageLoading
                                        ? `Checking whether "${container.name}" has existing usage…`
                                        : containerUsage.totalCount > 0
                                          ? `"${container.name}" is used by ${usageDescription} and cannot be deleted. Make it inactive instead to preserve those records.`
                                          : `Are you sure you want to delete "${container.name}"? This action cannot be undone.`}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDelete(container)}
                                      className="bg-red-600 hover:bg-red-700"
                                      disabled={
                                        usageLoading ||
                                        containerUsage.totalCount > 0 ||
                                        deleteContainer.isPending
                                      }
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={container.active ? "default" : "outline"}
                            >
                              {container.active ? "Active" : "Inactive"}
                            </Badge>
                            {containerUsage.collectionCount > 0 && (
                              <span className="text-muted-foreground text-xs">
                                {containerUsage.collectionCount} collection
                                {containerUsage.collectionCount === 1
                                  ? ""
                                  : "s"}
                              </span>
                            )}
                            {containerUsage.storageSubBatchCount > 0 && (
                              <span className="text-muted-foreground text-xs">
                                {containerUsage.storageSubBatchCount} storage
                                sub-batch
                                {containerUsage.storageSubBatchCount === 1
                                  ? ""
                                  : "es"}
                              </span>
                            )}
                          </div>

                          <div className="mt-auto flex items-center justify-between border-t pt-3">
                            <span className="text-muted-foreground text-sm">
                              Available for new{" "}
                              {container.purpose === "collection"
                                ? "collections"
                                : "storage records"}
                            </span>
                            <Switch
                              checked={container.active}
                              aria-label={`Toggle ${container.name} active`}
                              disabled={updateContainer.isPending}
                              onCheckedChange={() =>
                                handleToggleActive(container)
                              }
                            />
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Container</DialogTitle>
          </DialogHeader>
          <ContainerForm
            onSuccess={() => {
              setShowCreateModal(false)
              toast({ description: "Container created successfully" })
            }}
            onCancel={() => setShowCreateModal(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingContainer)}
        onOpenChange={() => setEditingContainer(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Container</DialogTitle>
          </DialogHeader>
          {editingContainer && (
            <ContainerForm
              instance={editingContainer}
              onSuccess={() => {
                setEditingContainer(null)
                toast({ description: "Container updated successfully" })
              }}
              onCancel={() => setEditingContainer(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
