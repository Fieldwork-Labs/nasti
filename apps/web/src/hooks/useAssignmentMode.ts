import { useState } from "react"
import type { BatchWithCurrentLocationAndSpecies } from "./useBatches"
import { useOpenClose } from "@nasti/ui/hooks"

interface AssignmentState {
  isActive: boolean
  selectedBatchIds: string[]
}

export const useAssignmentMode = (
  batches: BatchWithCurrentLocationAndSpecies[],
) => {
  const [assignmentState, setAssignmentState] =
    useState<AssignmentState | null>(null)
  const { setIsOpen: setShowAssignmentModal, isOpen: showAssignmentModal } =
    useOpenClose()

  // Get selected batches for assignment modal
  const selectedBatchesForAssignment = assignmentState
    ? batches.filter((batch) =>
        assignmentState.selectedBatchIds.includes(batch.id),
      )
    : []

  const handleAssignForTesting = (
    batch: BatchWithCurrentLocationAndSpecies,
  ) => {
    setAssignmentState({
      isActive: true,
      selectedBatchIds: [batch.id],
    })
  }

  const handleAddToAssignment = (batchId: string) => {
    setAssignmentState((prev) =>
      prev
        ? {
            ...prev,
            selectedBatchIds: [...prev.selectedBatchIds, batchId],
          }
        : null,
    )
  }

  const handleRemoveFromAssignment = (batchId: string) => {
    setAssignmentState((prev) =>
      prev
        ? {
            ...prev,
            selectedBatchIds: prev.selectedBatchIds.filter(
              (id) => id !== batchId,
            ),
          }
        : null,
    )
  }

  const handleCancelAssignment = () => {
    setAssignmentState(null)
  }

  const handleCompleteAssignment = () => {
    if (assignmentState && assignmentState.selectedBatchIds.length >= 1) {
      setShowAssignmentModal(true)
    }
  }

  const handleCloseAssignmentModal = () => {
    setShowAssignmentModal(false)
    setAssignmentState(null)
  }

  const getAssignmentModeForBatch = (
    batch: BatchWithCurrentLocationAndSpecies,
  ) => {
    if (!assignmentState) return undefined
    return {
      isActive: assignmentState.isActive,
      isSelected: assignmentState.selectedBatchIds.includes(batch.id),
      onAddToAssignment: () => handleAddToAssignment(batch.id),
      onRemoveFromAssignment: () => handleRemoveFromAssignment(batch.id),
      onCancelAssignment: handleCancelAssignment,
    }
  }

  return {
    assignmentState,
    showAssignmentModal,
    selectedBatchesForAssignment,
    handleAssignForTesting,
    handleCompleteAssignment,
    handleCloseAssignmentModal,
    getAssignmentModeForBatch,
  }
}
