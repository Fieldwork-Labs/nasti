import { useAdminOnly } from "@/hooks/useAdminOnly"
import { useSpecies } from "@/hooks/useSpecies"
import { createFileRoute } from "@tanstack/react-router"
import { usePagination, Pagination } from "@/components/common/pagination"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ButtonLink } from "@/components/ui/buttonLink"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PlusIcon } from "lucide-react"
import { useALAImage } from "@/hooks/useALAImage"
import { useSpeciesDetail } from "@/hooks/useALASpeciesDetail"
import { ImageIcon } from "lucide-react"

type SpeciesListItemProps = {
  ala_guid: string | null
  name: string
  indigenous_name?: string | null
}

export const SpeciesListItem = ({
  ala_guid,
  name,
  indigenous_name,
}: SpeciesListItemProps) => {
  const { data, error } = useSpeciesDetail(ala_guid)
  const { data: image } = useALAImage(data?.imageIdentifier, true)

  if (!data || error) {
    return <></>
  }

  return (
    <div className="flex h-16 gap-4">
      {image ? (
        <img
          src={image}
          alt={`${name} Image`}
          width={80}
          height={60}
          className="text-sm"
        />
      ) : (
        <span className="flex h-16 w-20 justify-center bg-slate-500 align-middle">
          <ImageIcon />
        </span>
      )}
      <div className="flex flex-col">
        <h5 className="font-bold">
          <i>{name}</i>
        </h5>
        <div className="flex flex-col">
          {data.commonNames.length > 0 && (
            <span>{data.commonNames[0].nameString}</span>
          )}
          {indigenous_name && <span>Indigenous Name: {indigenous_name}</span>}
        </div>
      </div>
    </div>
  )
}

const SpeciesList = () => {
  useAdminOnly()
  const { page, prevPage, nextPage, setPage, pageSize } = usePagination()
  const { data, count, isLoading, error } = useSpecies(page, pageSize)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <div>
      <div className="flex justify-between">
        <h2 className="mb-4 text-2xl font-semibold">Species</h2>
        {/* TODO <ButtonLink className="flex gap-1">
            <PlusIcon aria-label="New Trip" size={16} /> <span>Add new</span>
          </ButtonLink> */}
      </div>
      {!data || data.length === 0 ? (
        <p>No species found.</p>
      ) : (
        <div className="grid md:grid-cols-2 md:gap-4 lg:grid-cols-3 lg:gap-4">
          {data?.map((species) => (
            <SpeciesListItem key={species.id} {...species} />
          ))}
        </div>
      )}
      <Pagination
        page={page}
        pageCount={count ? Math.ceil(count / pageSize) : 0}
        nextPage={nextPage}
        prevPage={prevPage}
        setPage={setPage}
      />
    </div>
  )
}

export const Route = createFileRoute("/_private/species/")({
  component: SpeciesList,
})
