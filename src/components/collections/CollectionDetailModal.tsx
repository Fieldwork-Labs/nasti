import { useMemo, useState } from "react"
import { Modal } from "../ui/modal"
import Map, { Marker } from "react-map-gl"
import mapboxgl from "mapbox-gl"
import { parsePostGISPoint } from "@/lib/utils"
import { Collection } from "@/types"
import { SpeciesListItem } from "@/routes/_private/species"
import { PencilIcon, ShoppingBag } from "lucide-react"
import { usePeople } from "@/hooks/usePeople"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"

import useUserStore from "@/store/userStore"
import { UpdateCollectionModal } from "./CollectionFormModal"
import useOpenClose from "@/hooks/useOpenClose"

export const CollectionDetailModal = ({
  collection,
  open,
  onClose,
}: {
  collection?: Collection
  open: boolean
  onClose: () => void
}) => {
  const { isAdmin } = useUserStore()
  // Parse location coordinates
  const coordinates = useMemo(() => {
    if (!collection?.location) return null
    return parsePostGISPoint(collection.location)
  }, [collection])

  const [viewState, setViewState] = useState({
    longitude: coordinates?.longitude || 124,
    latitude: coordinates?.latitude || -28,
    zoom: 8,
  })

  const {
    open: openUpdateModal,
    isOpen: isOpenUpdateModal,
    close: closeUpdateModal,
  } = useOpenClose()

  const { data: people } = usePeople()
  const creator = people?.find((person) => person.id === collection?.created_by)

  if (!collection) return null

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onClose}
        title={
          <div className="flex justify-between">
            <span>Collection</span>
            {isAdmin && (
              <PencilIcon
                className="h-4 w-4 cursor-pointer"
                onClick={openUpdateModal}
              />
            )}
          </div>
        }
      >
        <div className="space-y-4">
          {/* Species Info */}
          {collection.species_id && (
            <div>
              <div className="text-lead mb-1">Species</div>
              <SpeciesListItem id={collection.species_id} allowEdit={false} />
            </div>
          )}
          {!collection.species_id && collection.field_name && (
            <div>
              <div className="text-lead mb-1">Species unknown</div>
              <div className="text-sm">Field Name:</div>
              <div>{collection.field_name}</div>
            </div>
          )}
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="h-min text-left align-middle font-medium text-muted-foreground">
                    Recorded at
                  </th>
                  <th className="h-min text-left align-middle font-medium text-muted-foreground">
                    Recorded by
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="h-min align-middle">
                    {new Date(collection.created_at).toLocaleString()}
                  </td>
                  <td className="h-min align-middle">
                    {creator?.name || "Unknown Person"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <div className="flex gap-2">
              {collection.species_uncertain ? (
                <Badge variant={"secondary"}>ID uncertain</Badge>
              ) : (
                <Badge>ID certain</Badge>
              )}
              {collection.specimen_collected && (
                <Badge>Specimen Collected</Badge>
              )}
              {collection.weight_estimate_kg && (
                <Badge>{collection.weight_estimate_kg} kg</Badge>
              )}
              {collection.plants_sampled_estimate && (
                <Badge>{collection.plants_sampled_estimate} plants</Badge>
              )}
            </div>
          </div>
          {collection.description && (
            <div>
              <div className="text-lead mb-1">Description</div>
              <div className="rounded-sm bg-secondary-background p-1 text-sm">
                {collection.description}
              </div>
            </div>
          )}

          {/* Map */}
          {coordinates && (
            <div className="h-[300px] w-full">
              <Map
                mapLib={mapboxgl as never}
                mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
                mapStyle="mapbox://styles/mapbox/satellite-v9"
                {...viewState}
                onMove={(evt) => setViewState(evt.viewState)}
                style={{ width: "100%", height: "100%" }}
              >
                <Marker
                  longitude={coordinates.longitude}
                  latitude={coordinates.latitude}
                >
                  <div className="rounded-full bg-white bg-opacity-50 p-2">
                    <ShoppingBag className="h-5 w-5 text-primary" />
                  </div>
                </Marker>
              </Map>
            </div>
          )}
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Close</Button>
        </div>
      </Modal>
      {isOpenUpdateModal && (
        <UpdateCollectionModal
          instance={collection}
          open={isOpenUpdateModal}
          close={closeUpdateModal}
        />
      )}
    </>
  )
}
