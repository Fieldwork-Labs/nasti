import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"
import { Spinner } from "@nasti/ui/spinner"
import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { ChevronLeft } from "lucide-react"

const TripDetail = () => {
  const { id } = useParams({ from: "/_private/trips/$id" })
  const { data, isPending } = useHydrateTripDetails({ id })
  const navigate = useNavigate()

  const handleBackClick = () => {
    navigate({ to: "/trips" })
  }

  if (isPending)
    return (
      <div className="px-auto mx-auto mt-36 flex flex-col items-center text-center">
        <Spinner size={"xl"} />
        <span className="text-2xl">Syncing Trip Data</span>
      </div>
    )

  return (
    <div>
      <div className="flex items-center py-2 text-2xl">
        <ChevronLeft onClick={handleBackClick} width={36} height={36} />{" "}
        {data.trip?.name}
      </div>
      {JSON.stringify(data)}
    </div>
  )
}

export const Route = createFileRoute("/_private/trips/$id")({
  component: TripDetail,
  pendingComponent: () => (
    <div className="px-auto mx-auto mt-36">
      <Spinner size={"xl"} />
    </div>
  ),
})
