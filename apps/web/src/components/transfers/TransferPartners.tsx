import {
  useCancelOwnershipTransfer,
  useRespondTransferLinkRequest,
  useTransferLinkRequests,
  type IncomingTransferRequest,
  type OutgoingTransfer,
} from "@/hooks/useTransfers"
import useUserStore from "@/store/userStore"
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
import { Button } from "@nasti/ui/button"
import { Card } from "@nasti/ui/card"
import { useToast } from "@nasti/ui/hooks"
import { Link } from "@tanstack/react-router"

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

const bagLabel = (bag: {
  species_name: string | null
  collection_code: string | null
  weight_grams: number
}) =>
  `${bag.species_name ?? "Unknown species"} · ${bag.collection_code ?? "No collection code"} · ${bag.weight_grams} g`

const EmptyState = ({ children }: { children: string }) => (
  <p className="text-sm text-gray-500">{children}</p>
)

const IncomingRequestCard = ({
  request,
}: {
  request: IncomingTransferRequest
}) => {
  const { toast } = useToast()
  const respond = useRespondTransferLinkRequest()

  const handleRespond = async (accept: boolean) => {
    try {
      await respond.mutateAsync({ request_id: request.request_id, accept })
      toast({
        description: accept
          ? `${request.requesting_org_name} can now send you seed`
          : `Declined the request from ${request.requesting_org_name}`,
      })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error
            ? error.message
            : "Failed to respond to the request",
      })
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-semibold">{request.requesting_org_name}</h3>
        <p className="text-sm text-gray-500">
          Requested {formatDate(request.created_at)} to send you seed
        </p>
      </div>
      <ul className="list-disc pl-5 text-sm">
        {request.bags.map((bag) => (
          <li key={bag.transfer_id + bagLabel(bag)}>{bagLabel(bag)}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          disabled={respond.isPending}
          onClick={() => handleRespond(true)}
        >
          Accept
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={respond.isPending}>
              Decline
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Decline this request?</AlertDialogTitle>
              <AlertDialogDescription>
                {request.requesting_org_name} will not be able to send you these
                bags and will need to request again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep request</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleRespond(false)}>
                Decline
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  )
}

const OutgoingTransferCard = ({ transfer }: { transfer: OutgoingTransfer }) => {
  const { toast } = useToast()
  const cancel = useCancelOwnershipTransfer()

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync(transfer.transfer_id)
      toast({ description: "Transfer cancelled" })
    } catch (error) {
      toast({
        variant: "destructive",
        description:
          error instanceof Error ? error.message : "Failed to cancel transfer",
      })
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="font-semibold">To {transfer.recipient_org_name}</h3>
        <p className="text-sm text-gray-500">
          Sent {formatDate(transfer.created_at)}, waiting for them to accept
        </p>
        {transfer.notes && <p className="mt-1 text-sm">{transfer.notes}</p>}
      </div>
      <ul className="list-disc pl-5 text-sm">
        {transfer.items.map((item) => (
          <li key={item.sub_batch_id}>{bagLabel(item)}</li>
        ))}
      </ul>
      <div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={cancel.isPending}>
              Cancel transfer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this transfer?</AlertDialogTitle>
              <AlertDialogDescription>
                The bags will be released back to you and{" "}
                {transfer.recipient_org_name} will not receive them.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep transfer</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel}>
                Cancel transfer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Card>
  )
}

export const TransferPartners = () => {
  const { organisation, isAdmin } = useUserStore()
  const { data, isLoading, error } = useTransferLinkRequests()

  if (!isAdmin) {
    return (
      <p className="text-sm text-gray-500">
        Only organisation admins can manage transfer partners.
      </p>
    )
  }

  if (isLoading) return <p className="text-sm text-gray-500">Loading...</p>

  if (error || !data) {
    return (
      <p className="text-destructive text-sm">
        {error?.message ?? "Failed to load transfer partners"}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {organisation?.accepts_transfers === false && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Your organisation is not accepting transfers, so others cannot find
          you in the directory. You can change this in{" "}
          <Link
            to="/settings/organisation-details"
            className="font-medium underline"
          >
            organisation details
          </Link>
          .
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Incoming requests</h2>
        {data.incoming_requests.length === 0 ? (
          <EmptyState>
            No organisations are waiting to send you seed.
          </EmptyState>
        ) : (
          data.incoming_requests.map((request) => (
            <IncomingRequestCard key={request.request_id} request={request} />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Pending outgoing transfers</h2>
        {data.outgoing_transfers.length === 0 ? (
          <EmptyState>
            You have no transfers waiting on another organisation.
          </EmptyState>
        ) : (
          data.outgoing_transfers.map((transfer) => (
            <OutgoingTransferCard
              key={transfer.transfer_id}
              transfer={transfer}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Partners</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">You can send to</h3>
            {data.outgoing_links.length === 0 ? (
              <EmptyState>
                No partners yet. Partners appear here after they accept your
                first transfer.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.outgoing_links.map((link) => (
                  <li key={link.recipient_org_name}>
                    {link.recipient_org_name}{" "}
                    <span className="text-gray-500">
                      since {formatDate(link.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Can send to you</h3>
            {data.incoming_links.length === 0 ? (
              <EmptyState>
                No organisations are approved to send you seed.
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {organisation?.accepts_transfers === false && (
                  <li className="text-amber-600">
                    Paused while you are not accepting transfers. Turning
                    transfers back on restores these partners.
                  </li>
                )}
                {data.incoming_links.map((link) => (
                  <li key={link.sender_org_name}>
                    {link.sender_org_name}{" "}
                    <span className="text-gray-500">
                      since {formatDate(link.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
