import { create } from "zustand"

/**
 * Ghosts flying from a picked bag into the basket.
 *
 * Kept out of the basket store on purpose: that store is what is being sent for
 * testing, and it should not gain fields that exist only to drive an animation.
 * Nothing here affects what the confirmation page reads.
 */
export type BagFlight = {
  id: number
  label: string
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/** The basket icon marks itself with this so a flight can find its target. */
export const BASKET_TARGET_ID = "bag-basket-target"

type BagFlightState = {
  flights: BagFlight[]
  launch: (origin: DOMRect, label: string) => void
  land: (id: number) => void
}

let nextFlightId = 0

const centreOf = (rect: DOMRect) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
})

const useBagFlightStore = create<BagFlightState>((set) => ({
  flights: [],

  launch: (origin, label) => {
    const target = document
      .getElementById(BASKET_TARGET_ID)
      ?.getBoundingClientRect()

    // No basket on screen means nothing to fly to. Silently skipping is right:
    // the bag is already in the basket by the time this is called, and motion
    // is never the only signal that it worked.
    if (!target) return

    const id = nextFlightId++
    set((state) => ({
      flights: [
        ...state.flights,
        { id, label, from: centreOf(origin), to: centreOf(target) },
      ],
    }))
  },

  land: (id) =>
    set((state) => ({
      flights: state.flights.filter((flight) => flight.id !== id),
    })),
}))

export default useBagFlightStore
