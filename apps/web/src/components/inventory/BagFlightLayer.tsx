import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { createPortal } from "react-dom"

import useBagFlightStore from "./bagFlight"

/**
 * The ghosts in flight, drawn above everything in a portal.
 *
 * A staged sequence that runs once and is never interrupted, which is the case
 * keyframed motion is for — unlike the row's selected state, which is a CSS
 * transition so it can be reversed mid-flight.
 *
 * `pointer-events-none` throughout: a ghost passing over the table must never
 * swallow a click meant for the bag underneath it.
 */
export const BagFlightLayer = () => {
  const flights = useBagFlightStore((state) => state.flights)
  const land = useBagFlightStore((state) => state.land)
  const prefersReducedMotion = useReducedMotion()

  if (prefersReducedMotion) return null
  if (typeof document === "undefined") return null

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {/* initial={false} would suppress the enter, which is the whole animation. */}
      <AnimatePresence>
        {flights.map((flight) => (
          <motion.div
            key={flight.id}
            initial={{
              x: flight.from.x,
              y: flight.from.y,
              scale: 1,
              opacity: 1,
            }}
            animate={{
              x: flight.to.x,
              y: flight.to.y,
              // Shrinking into the basket reads as the bag being put away.
              scale: 0.25,
              opacity: 0,
            }}
            transition={{
              // A single arc, not a bounce: it should look like something being
              // placed, not thrown.
              duration: 0.5,
              ease: [0.2, 0, 0, 1],
              opacity: { duration: 0.5, times: [0, 1], ease: "easeIn" },
            }}
            onAnimationComplete={() => land(flight.id)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              // The element is positioned by its own centre, so it lands on the
              // basket's centre rather than hanging off its corner.
              translateX: "-50%",
              translateY: "-50%",
              willChange: "transform, opacity",
            }}
            className="bg-primary text-primary-foreground rounded px-2 py-0.5 font-mono text-xs font-semibold shadow-lg"
          >
            {flight.label}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  )
}
