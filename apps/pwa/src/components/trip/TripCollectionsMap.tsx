import { useHydrateTripDetails } from "@/hooks/useHydrateTripDetails"

import { useViewState } from "@nasti/common/hooks"
import { BinocularsIcon, ShoppingBag } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useGeoLocation } from "@/contexts/location"
import mapboxgl from "mapbox-gl"
import Map, { MapRef, Marker, Popup } from "react-map-gl"
import { Link } from "@tanstack/react-router"
import { useCollection } from "@/hooks/useCollection"
import "mapbox-gl/dist/mapbox-gl.css"
import { useScoutingNote } from "@/hooks/useScoutingNote"

const CollectionPopup = ({
  collectionId,
  tripId,
  onClose,
}: {
  collectionId: string
  tripId: string
  onClose: () => void
}) => {
  const collection = useCollection({ collectionId, tripId })
  if (!collection || !collection.locationCoord) return <></>
  return (
    <Popup onClose={onClose} {...collection.locationCoord}>
      <Link
        to={"/trips/$id/collections/$collectionId"}
        params={{ id: tripId, collectionId: collection.id }}
        className="text-primary"
      >
        {collection?.species?.name || collection.field_name} collection
      </Link>
    </Popup>
  )
}

const ScoutingNotePopup = ({
  scoutingNoteId,
  tripId,
  onClose,
}: {
  scoutingNoteId: string
  tripId: string
  onClose: () => void
}) => {
  const scoutingNote = useScoutingNote({ scoutingNoteId, tripId })
  if (!scoutingNote || !scoutingNote.locationCoord) return <></>
  return (
    <Popup onClose={onClose} {...scoutingNote.locationCoord}>
      <Link
        to={"/trips/$id/scouting-notes/$scoutingNoteId"}
        params={{ id: tripId, scoutingNoteId: scoutingNote.id }}
        className="text-primary"
      >
        {scoutingNote?.species?.name || scoutingNote.field_name} scouting note
      </Link>
    </Popup>
  )
}

export const TripCollectionsMap = ({ id }: { id: string }) => {
  const { data } = useHydrateTripDetails({ id })
  const { location } = useGeoLocation()

  const [showPopup, setShowPopup] = useState<{
    entityType: "collection" | "scoutingNote"
    id: string
  } | null>(null)
  const [mapHeight, setMapHeight] = useState("calc(100vh - 100px)")
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapRef>(null)

  useEffect(() => {
    const updateMapHeight = () => {
      if (mapContainerRef.current) {
        // Get the top position of the map container
        const topPosition = mapContainerRef.current.getBoundingClientRect().top
        // Calculate remaining viewport height
        setMapHeight(`calc(100vh - ${topPosition}px)`)
      }
    }

    // Initial calculation
    updateMapHeight()

    // Add resize listener
    window.addEventListener("resize", updateMapHeight)

    // Cleanup
    return () => window.removeEventListener("resize", updateMapHeight)
  }, [])

  const collections =
    data.trip?.collections.filter((col) => Boolean(col.locationCoord)) ?? []

  const scoutingNotes =
    data.trip?.scoutingNotes.filter((sn) => Boolean(sn.locationCoord)) ?? []

  const initialDataCoords: Array<[number, number]> = [
    ...collections,
    ...scoutingNotes,
  ].map(({ locationCoord }) => [
    locationCoord!.longitude,
    locationCoord!.latitude,
  ])

  if (location) {
    initialDataCoords.push([location.longitude, location.latitude])
  }
  // Calculate bounds based on all trip coordinates
  const initialViewState = useViewState(initialDataCoords)

  useEffect(() => {
    if (!mapRef.current || initialDataCoords.length === 0) return

    mapRef.current.resize()

    const bounds = initialDataCoords.reduce(
      (bounds, coord) => bounds.extend(coord),
      new mapboxgl.LngLatBounds(initialDataCoords[0], initialDataCoords[0]),
    )

    mapRef.current.fitBounds(bounds, {
      padding: 120,
      duration: 200,
    })
  }, [initialDataCoords, mapHeight])

  return (
    <div ref={mapContainerRef} className="w-full" style={{ height: mapHeight }}>
      <Map
        mapLib={mapboxgl as never}
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/satellite-v9"
      >
        {location && (
          <Marker {...location}>
            <div className="h-4 w-4 rounded-full border border-blue-400 bg-blue-500" />
          </Marker>
        )}
        {collections.map((col) => (
          <Marker {...col.locationCoord!} key={col.id}>
            <div className="rounded-full bg-white/50 p-2">
              <ShoppingBag
                className="text-primary h-5 w-5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopup({
                    entityType: "collection",
                    id: col.id,
                  })
                }}
              />
            </div>
          </Marker>
        ))}
        {scoutingNotes.map((sn) => (
          <Marker {...sn.locationCoord!} key={sn.id}>
            <div className="rounded-full bg-white/50 p-2">
              <BinocularsIcon
                className="text-primary h-5 w-5 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowPopup({
                    entityType: "scoutingNote",
                    id: sn.id,
                  })
                }}
              />
            </div>
          </Marker>
        ))}
        {showPopup && showPopup.entityType === "collection" && (
          <CollectionPopup
            tripId={id}
            collectionId={showPopup.id}
            onClose={() => setShowPopup(null)}
          />
        )}
        {showPopup && showPopup.entityType === "scoutingNote" && (
          <ScoutingNotePopup
            tripId={id}
            scoutingNoteId={showPopup.id}
            onClose={() => setShowPopup(null)}
          />
        )}
      </Map>
    </div>
  )
}
