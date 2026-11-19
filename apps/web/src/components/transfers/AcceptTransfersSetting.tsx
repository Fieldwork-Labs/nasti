import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@nasti/ui/alert-dialog"
import { useToast } from "@nasti/ui/hooks"
import { Switch } from "@nasti/ui/switch"
import { useState } from "react"

import {
  useSetAcceptsTransfers,
  useTransferLinkRequests,
} from "@/hooks/useTransfers"
import useUserStore from "@/store/userStore"

/**
 * Admin opt-in to the transfer directory. Turning it off cancels other
 * organisations' pending transfers to us, so that direction asks first when
 * anything is pending.
 */
export const AcceptTransfersSetting = () => {
  const { organisation } = useUserStore()
  const { toast } = useToast()
  const setAccepts = useSetAcceptsTransfers()
  const { data: requests } = useTransferLinkRequests()
  const [confirmingOff, setConfirmingOff] = useState(false)

  const pendingCount = requests?.incoming_request_count ?? 0

  const apply = async (accepts: boolean) => {
    try {
      const result = await setAccepts.mutateAsync(accepts)
      const closed =
        result.cancelled_request_ids.length +
        result.cancelled_transfer_ids.length
      toast({
        description: accepts
          ? "Your organisation now accepts seed transfers"
          : closed > 0
            ? "Seed transfers turned off. Pending incoming requests were closed."
            : "Seed transfers turned off",
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update transfer setting",
      })
    }
  }

  const handleChange = (accepts: boolean) => {
    if (!accepts && pendingCount > 0) {
      setConfirmingOff(true)
      return
    }
    void apply(accepts)
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="accepts-transfers" className="font-medium">
          Accept seed transfers from other organisations
        </label>
        <p className="text-sm text-gray-500">
          Turning this off closes pending incoming requests and releases the
          bags reserved for them. Turning it back on restores partners you had
          already accepted.
        </p>
      </div>
      <Switch
        id="accepts-transfers"
        checked={organisation?.accepts_transfers ?? false}
        disabled={setAccepts.isPending}
        onCheckedChange={handleChange}
      />
      <AlertDialog open={confirmingOff} onOpenChange={setConfirmingOff}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop accepting transfers?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCount === 1
                ? "1 organisation is waiting to send you seed."
                : `${pendingCount} organisations are waiting to send you seed.`}{" "}
              Their requests will be closed and the bags returned to them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep accepting</AlertDialogCancel>
            <AlertDialogAction onClick={() => void apply(false)}>
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
