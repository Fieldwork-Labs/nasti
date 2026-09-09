import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"
import { cn } from "@nasti/ui/utils"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeft, ShoppingBasket, TriangleAlert, X } from "lucide-react"
import { useMemo, useState } from "react"

import { useAssignBagsForTesting } from "@/hooks/useAssignBagsForTesting"
import {
  useBagsForAssignment,
  type BagForAssignment,
} from "@/hooks/useBagsForAssignment"
import { useOrganisationLinks } from "@/hooks/useTestingOrgs"
import { estimatePureLiveSeedCount } from "@/lib/pureLiveSeed"
import { resolveSendingWeight, type SendingWeight } from "@/lib/sendingWeight"
import useBagBasketStore, { useBasketBags } from "@/store/bagBasketStore"

const formatCount = (value: number | null) =>
  value === null ? "—" : value.toLocaleString()

/**
 * Confirm what is being sent, and to whom.
 *
 * Everything shown here is re-read from the server rather than taken from the
 * basket: a basket can sit open while a test consumes seed or another Admin
 * sends the same bag.
 */
export const SendForTestingPage = () => {
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
  const { data: links = [] } = useOrganisationLinks()
  const assignBags = useAssignBagsForTesting()

  const [testingOrgId, setTestingOrgId] = useState<string>("")
  // Keyed by sub_batch_id. Absent means "send the whole bag"; a number means
  // split that much off and send the child instead.
  const [sampleWeights, setSampleWeights] = useState<Record<string, string>>({})

  // One resolution of the weight rule per bag, reused by every column, both
  // totals, the validity check and the payload. Recomputed on each render so
  // the pure live seed figure tracks the input as it is typed.
  const rows: Array<{
    bag: BagForAssignment
    sending: SendingWeight
    pureLiveSeedCount: number | null
  }> = bags.map((bag) => {
    const sending = resolveSendingWeight(
      sampleWeights[bag.subBatchId],
      bag.currentWeightGrams,
    )

    return {
      bag,
      sending,
      // Derived from what is actually being sent, not scaled down from a
      // full-bag total — rounding a fraction of a rounded count drifts.
      pureLiveSeedCount:
        sending.kind === "invalid"
          ? null
          : estimatePureLiveSeedCount(
              sending.grams,
              bag.pureLiveSeedStatistics,
            ),
    }
  })

  const sendableRows = rows.filter((row) => !row.bag.alreadyAssigned)
  const sendable = sendableRows.map((row) => row.bag)
  const blocked = bags.filter((bag) => bag.alreadyAssigned)

  const totalWeight = sendableRows.reduce(
    (sum, row) =>
      sum + (row.sending.kind === "invalid" ? 0 : row.sending.grams),
    0,
  )

  const totalPls = sendableRows.reduce<number | null>((sum, row) => {
    if (sum === null || row.pureLiveSeedCount === null) return null
    return sum + row.pureLiveSeedCount
  }, 0)

  const hasWeightError = sendableRows.some(
    (row) => row.sending.kind === "invalid",
  )

  // Kept apart from the weight error: an untested bag and an unusable number
  // both leave the total unknown, but they are not the same problem and must
  // not be explained with the same sentence.
  const hasUntestedBag = sendableRows.some(
    (row) => row.bag.pureLiveSeedStatistics === null,
  )

  const canSend =
    Boolean(testingOrgId) &&
    sendable.length > 0 &&
    !hasWeightError &&
    !assignBags.isPending

  const handleSend = async () => {
    try {
      await assignBags.mutateAsync({
        provider_org_id: testingOrgId,
        sub_batch_assignments: sendableRows.map(({ bag, sending }) => ({
          sub_batch_id: bag.subBatchId,
          // Only a genuine sample carries a weight; sending the whole bag is
          // expressed by omitting it.
          ...(sending.kind === "sample"
            ? { sample_weight_grams: sending.grams }
            : {}),
        })),
      })

      toast({
        description: `Sent ${sendable.length} bag${sendable.length === 1 ? "" : "s"} for testing`,
      })
      clearBasket()
      navigate({ to: "/inventory" })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to send bags",
      })
    }
  }

  if (basketBags.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-8 text-center">
          <ShoppingBasket className="text-muted-foreground mx-auto mb-3 h-10 w-10" />
          <h2 className="mb-1 text-lg font-semibold">Your basket is empty</h2>
          <p className="text-muted-foreground mb-4">
            Pick some bags from the inventory to send for testing.
          </p>
          <Button onClick={() => navigate({ to: "/inventory" })}>
            Back to inventory
          </Button>
        </Card>
      </div>
    )
  }

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
          <h1 className="text-3xl font-bold">Send bags for testing</h1>
          <p className="text-muted-foreground">
            Check what is going, then choose who it is going to.
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
                <th className="px-4 py-3 text-right font-semibold">
                  Pure live seed
                </th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ bag, sending, pureLiveSeedCount }) => {
                const raw = sampleWeights[bag.subBatchId] ?? ""
                const invalid = sending.kind === "invalid"

                return (
                  <tr
                    key={bag.subBatchId}
                    className={cn(
                      "border-b",
                      bag.alreadyAssigned && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-sm">
                      {bag.batchCode ?? "—"}
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
                        disabled={bag.alreadyAssigned}
                        value={raw}
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
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCount(pureLiveSeedCount)}
                      {sending.kind === "sample" && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          of{" "}
                          {formatCount(
                            estimatePureLiveSeedCount(
                              bag.currentWeightGrams,
                              bag.pureLiveSeedStatistics,
                            ),
                          )}
                        </span>
                      )}
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
                  {sendable.length} bag{sendable.length === 1 ? "" : "s"}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {totalWeight}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums">
                  {formatCount(totalPls)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {blocked.length > 0 && (
        <div className="flex items-start gap-2 rounded border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {blocked.length} bag{blocked.length === 1 ? " was" : "s were"} sent
            for testing since you added {blocked.length === 1 ? "it" : "them"}{" "}
            to the basket, and will be skipped.
          </p>
        </div>
      )}

      {hasWeightError && (
        <p className="text-destructive text-sm">
          A sending weight is more than its bag holds, or is not a number. Clear
          the field to send the whole bag.
        </p>
      )}

      {hasUntestedBag && (
        <p className="text-muted-foreground text-sm">
          Some of these bags have never been tested, so the pure live seed total
          cannot be worked out. An untested bag shows a dash rather than a zero.
        </p>
      )}

      <Card className="space-y-4 p-6">
        <div>
          <label
            htmlFor="testing-org"
            className="mb-1 block text-sm font-medium"
          >
            Testing organisation
          </label>
          <select
            id="testing-org"
            value={testingOrgId}
            onChange={(event) => setTestingOrgId(event.target.value)}
            className="w-full max-w-md rounded border px-3 py-2"
          >
            <option value="">Choose a laboratory…</option>
            {links.map((link) => (
              <option key={link.id} value={link.provider_org_id}>
                {link.testing_org_name || "Unnamed organisation"}
              </option>
            ))}
          </select>
          {links.length === 0 && (
            <p className="text-muted-foreground mt-1 text-sm">
              You are not linked to any testing organisations yet.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => navigate({ to: "/inventory" })}
          >
            Keep choosing
          </Button>
          <Button disabled={!canSend} onClick={handleSend}>
            {assignBags.isPending
              ? "Sending…"
              : `Send ${sendable.length} bag${sendable.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </Card>
    </div>
  )
}
