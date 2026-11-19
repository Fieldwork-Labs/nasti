import { TransferPartners } from "@/components/transfers/TransferPartners"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_private/settings/transfer-partners")({
  component: TransferPartnersPage,
})

function TransferPartnersPage() {
  return (
    <div className="mt-6 flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-2xl font-bold">Transfer partners</h1>
        <p className="text-gray-600">
          Manage organisations you send seed to and receive seed from
        </p>
      </div>
      <TransferPartners />
    </div>
  )
}
