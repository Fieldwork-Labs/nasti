import { TripDetailsForm, useTripForm } from "../forms/TripDetailsForm"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"

import { Trip } from "@nasti/common/types"
import { useTripDetail } from "@/hooks/useTripDetail"
import { Spinner } from "@nasti/ui/spinner"
import { useCallback, useEffect, useState } from "react"
import useUserStore from "@/store/userStore"
import { useQueryClient } from "@tanstack/react-query"
import { useToast } from "@nasti/ui/hooks"
import { Button, buttonVariants } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import { useNavigate } from "@tanstack/react-router"

export const TripDetailsModal = ({
  isOpen,
  trip,
  close,
}: {
  isOpen: boolean
  close: () => void
  trip: Trip
}) => {
  const [isDeleting, setIsDeleting] = useState(false)

  return (
    <AlertDialog open={isOpen} onOpenChange={() => close()}>
      {!isDeleting && (
        <TripEditModalContent
          trip={trip}
          onCancel={close}
          onSuccess={close}
          onDeleteClick={() => setIsDeleting(true)}
        />
      )}
      {isDeleting && (
        <TripDeleteModalContent
          trip={trip}
          onCancel={() => setIsDeleting(false)}
          onSuccess={close}
        />
      )}
    </AlertDialog>
  )
}

const TripEditModalContent = ({
  trip,
  onSuccess,
  onCancel,
  onDeleteClick,
}: {
  onSuccess: () => void
  trip: Trip
  onCancel: () => void
  onDeleteClick: () => void
}) => {
  const { invalidate } = useTripDetail(trip?.id)

  const { register, handleSubmit, isValid, errors, isSubmitting } = useTripForm(
    {
      instance: trip,
      onSuccess: () => {
        invalidate()
        onSuccess()
      },
    },
  )

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Edit Trip</AlertDialogTitle>

        <TripDetailsForm register={register} errors={errors} />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button
          className={cn(
            buttonVariants({ variant: "destructive" }),
            "self-start",
          )}
          onClick={onDeleteClick}
        >
          Delete
        </Button>

        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>

        <AlertDialogAction
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
        >
          {!isSubmitting && "Save"}
          {isSubmitting && <Spinner />}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

const TripDeleteModalContent = ({
  trip,
  onCancel,
  onSuccess,
}: {
  trip: Trip
  onCancel: () => void
  onSuccess: () => void
}) => {
  const { orgId, isAdmin, session } = useUserStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [isDeleting, setIsDeleting] = useState(false)
  const [canDelete, setCanDelete] = useState(false)

  useEffect(() => {
    setTimeout(() => {
      setCanDelete(true)
    }, 1000)
  }, [])

  const handleDelete = useCallback(async () => {
    if (!isAdmin) return
    if (isDeleting) return
    if (!canDelete) return
    setIsDeleting(true)
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete_trip_data`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ tripId: trip.id }),
      },
    )

    if (!response.ok) {
      const message = await response.text()
      toast({
        variant: "destructive",
        description: `Failed to delete trip: ${message}`,
      })
    } else {
      toast({ description: "Trip deleted successfully." })
      queryClient.invalidateQueries({ queryKey: ["trips", orgId] })
      onSuccess()
      navigate({ to: "/trips" })
    }
    setIsDeleting(false)
  }, [
    orgId,
    queryClient,
    toast,
    trip,
    isAdmin,
    isDeleting,
    canDelete,
    session,
    onSuccess,
    navigate,
  ])

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Trip</AlertDialogTitle>

        <p>
          This action cannot be undone. This will permanently delete the trip
          and all associated data.
        </p>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>

        <AlertDialogAction
          onClick={(e) => {
            e.preventDefault()
            handleDelete()
          }}
          className={buttonVariants({ variant: "destructive" })}
          disabled={isDeleting || !canDelete}
        >
          {!isDeleting && "Confirm Delete"}
          {isDeleting && <Spinner />}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}
