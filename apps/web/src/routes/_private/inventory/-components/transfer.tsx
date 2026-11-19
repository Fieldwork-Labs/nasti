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
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"
import { Textarea } from "@nasti/ui/textarea"
import { cn } from "@nasti/ui/utils"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ShoppingBasket, TriangleAlert, X } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import {
  useBagsForAssignment,
  type BagForAssignment,
} from "@/hooks/useBagsForAssignment"
import {
  useSendBagsForTransfer,
  useSubBatchReservations,
  useTransferDirectory,
} from "@/hooks/useTransfers"
import { resolveSendingWeight, type SendingWeight } from "@/lib/sendingWeight"
import useBagBasketStore, { useBasketBags } from "@/store/bagBasketStore"

/**
 * Give bags to another organisation, permanently.
 *
 * Built on the send-for-testing page: what is shown is re-read from the
 * server rather than taken from the basket, because a basket can sit open
 * while another request reserves or sends the same bag.
 */
export const TransferPage = () => {
  const navigate = useNavigate()
  const { toast } = useToast()

  const basketBags = useBasketBags()
  const removeBag = useBagBasketStore((state) => state.removeBag)
  const clearBasket = useBagBasketStore((state) => state.clear)

  const subBatchIds = useMemo(
    () => basketBags.map((bag) => bag.subBatchId),
    [basketBags],
  )

  const { data: bags = [], isLoading } = useBagsForAssignment(subBatchIds)
  const { data: reservations } = useSubBatchReservations()
  const { data: directory = [], isLoading: directoryLoading } =
    useTransferDirectory()
  const sendBags = useSendBagsForTransfer()

  const [recipientOrgId, setRecipientOrgId] = useState("")
  const [notes, setNotes] = useState("")
  // Keyed by sub_batch_id. Absent means "send the whole bag".
  const [sampleWeights, setSampleWeights] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  // The request ID belongs to one confirmed intent. It is kept with the
  // fingerprint of the inputs it was made for: a retry after an error has the
  // same fingerprint and so reuses it (the server then replays rather than
  // sending twice), while any edit changes the fingerprint and gets a new one.
  const requestRef = useRef<{ fingerprint: string; id: string } | null>(null)

  const rows: Array<{
    bag: BagForAssignment
    sending: SendingWeight
    reservedFor: string | null
  }> = bags.map((bag) => ({
    bag,
    sending: resolveSendingWeight(
      sampleWeights[bag.subBatchId],
      bag.currentWeightGrams,
    ),
    reservedFor: reservations?.get(bag.subBatchId)?.recipient_org_name ?? null,
  }))

  const isBlocked = (row: (typeof rows)[number]) =>
    row.reservedFor !== null || row.bag.alreadyAssigned

  const sendableRows = rows.filter((row) => !isBlocked(row))
  const blockedRows = rows.filter(isBlocked)

  const totalWeight = sendableRows.reduce(
    (sum, row) =>
      sum + (row.sending.kind === "invalid" ? 0 : row.sending.grams),
    0,
  )
  const hasWeightError = sendableRows.some(
    (row) => row.sending.kind === "invalid",
  )

  const linked = directory.filter((org) => org.is_linked)
  const unlinked = directory.filter((org) => !org.is_linked)
  const recipient = directory.find((org) => org.id === recipientOrgId)

  const canSend =
    Boolean(recipient) &&
    sendableRows.length > 0 &&
    !hasWeightError &&
    !isLoading &&
    reservations !== undefined &&
    !sendBags.isPending

  const payloadBags = sendableRows.map(({ bag, sending }) => ({
    sub_batch_id: bag.subBatchId,
    // Only a genuine sample carries a weight; the whole bag is expressed by
    // omitting it.
    ...(sending.kind === "sample"
      ? { sample_weight_grams: sending.grams }
      : {}),
  }))
  const trimmedNotes = notes.trim()

  const handleConfirm = async () => {
    if (!recipient) return

    const fingerprint = JSON.stringify([
      recipient.id,
      payloadBags,
      trimmedNotes,
    ])
    if (requestRef.current?.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, id: crypto.randomUUID() }
    }

    try {
      const result = await sendBags.mutateAsync({
        recipient_org_id: recipient.id,
        bags: payloadBags,
        notes: trimmedNotes === "" ? null : trimmedNotes,
        request_id: requestRef.current.id,
      })

      const recipientName = result.transfer.recipient_org_name
      toast({
        description:
          result.transfer.status === "completed"
            ? `Transferred to ${recipientName}`
            : `Link request sent to ${recipientName}; bags reserved until they accept`,
      })
      // Only the bags that went; skipped ones stay in the basket.
      if (blockedRows.length === 0) {
        clearBasket()
      } else {
        for (const { bag } of sendableRows) removeBag(bag.subBatchId)
      }
      requestRef.current = null
      navigate({ to: "/inventory" })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to transfer bags",
      })
    } finally {
      setConfirmOpen(false)
    }
  }

  if (basketBags.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-8 text-center">
          <ShoppingBasket className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h2 className="mb-1 text-lg font-semibold">Your basket is empty</h2>
          <p className="text-muted-foreground mb-4">
            Pick some bags from the inventory to transfer.
          </p>
          <Button onClick={() => navigate({ to: "/inventory" })}>
            Back to inventory
          </Button>
        </Card>
      </div>
    )
  }

  const bagCountLabel = `${sendableRows.length} bag${sendableRows.length === 1 ? "" : "s"}`

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/inventory" })}
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Transfer bags</h1>
          <p className="text-muted-foreground">
            Give seed to another organisation. They become its owner.
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="h-24 animate-pulse" />
        ) : (
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Batch</th>
                <th className="px-4 py-3 text-left font-semibold">Container</th>
                <th className="px-4 py-3 text-right font-semibold">
                  In bag (g)
                </th>
                <th className="px-4 py-3 text-right font-semibold">
                  Sending (g)
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { bag, sending, reservedFor } = row
                const blocked = isBlocked(row)
                const invalid = !blocked && sending.kind === "invalid"

                return (
                  <tr
                    key={bag.subBatchId}
                    className={cn("border-b", blocked && "opacity-50")}
                  >
                    <td className="px-4 py-3 font-mono text-sm">
                      {bag.batchCode ?? "—"}
                      {blocked && (
                        <span className="text-muted-foreground ml-2 font-sans text-xs">
                          {reservedFor !== null
                            ? `Reserved for transfer to ${reservedFor}`
                            : "Out for testing"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {bag.containerName ?? "Unlabelled"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {bag.currentWeightGrams}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        disabled={blocked}
                        value={sampleWeights[bag.subBatchId] ?? ""}
                        placeholder={String(bag.currentWeightGrams)}
                        onChange={(event) =>
                          setSampleWeights((prev) => ({
                            ...prev,
                            [bag.subBatchId]: event.target.value,
                          }))
                        }
                        className={cn(
                          "w-24 rounded border px-2 py-1 text-right tabular-nums",
                          invalid && "border-destructive",
                        )}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeBag(bag.subBatchId)}
                        title="Remove from basket"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-muted/30">
              <tr>
                <td colSpan={3} className="px-4 py-3 font-semibold">
                  {bagCountLabel}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {totalWeight}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {blockedRows.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {blockedRows.length} bag{blockedRows.length === 1 ? " is" : "s are"}{" "}
            reserved or out for testing and will be skipped.
          </p>
        </div>
      )}

      {hasWeightError && (
        <p className="text-destructive text-sm">
          A sending weight is more than its bag holds, or is not a number. Clear
          the field to send the whole bag.
        </p>
      )}

      <Card className="space-y-4 p-6">
        <div>
          <label
            htmlFor="transfer-recipient"
            className="mb-1 block text-sm font-medium"
          >
            Recipient organisation
          </label>
          <select
            id="transfer-recipient"
            value={recipientOrgId}
            onChange={(event) => setRecipientOrgId(event.target.value)}
            className="w-full max-w-md rounded border px-3 py-2"
          >
            <option value="">Choose an organisation…</option>
            {linked.length > 0 && (
              <optgroup label="Linked organisations">
                {linked.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </optgroup>
            )}
            {unlinked.length > 0 && (
              <optgroup label="Not yet linked (link request needed)">
                {unlinked.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                    {org.has_pending_request ? " (request pending)" : ""}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {!directoryLoading && directory.length === 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              No organisations are accepting transfers yet.
            </p>
          )}
          {recipient && !recipient.is_linked && (
            <p className="mt-2 max-w-md text-sm text-orange-800">
              You are not linked to {recipient.name}. A link request will be
              sent and the bags reserved until they accept.
              {recipient.has_pending_request &&
                " A request to them is already pending; these bags will wait on it."}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="transfer-notes"
            className="mb-1 block text-sm font-medium"
          >
            Notes (optional)
          </label>
          <Textarea
            id="transfer-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Anything the recipient should know"
            className="max-w-md"
          />
        </div>

        {sendBags.isError && (
          <p className="text-destructive text-sm">
            {sendBags.error.message}. You can confirm again to retry; the
            transfer will not be sent twice.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/inventory" })}
          >
            Keep choosing
          </Button>
          <Button disabled={!canSend} onClick={() => setConfirmOpen(true)}>
            {sendBags.isPending ? "Transferring…" : `Transfer ${bagCountLabel}`}
          </Button>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Transfer {bagCountLabel} to {recipient?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {totalWeight}g of seed will be transferred. This is permanent:{" "}
                  {recipient?.name} becomes the owner and you cannot get the
                  seed back.
                </p>
                {recipient && !recipient.is_linked && (
                  <p>
                    They are not linked to you yet, so a link request will be
                    sent and the bags reserved until they accept. Until then you
                    can cancel the transfer, and that is the only way back.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void handleConfirm()
              }}
              disabled={sendBags.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {sendBags.isPending ? "Transferring…" : "Transfer permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
