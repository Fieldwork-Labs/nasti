import { Button } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"

import { BagFlightLayer } from "./BagFlightLayer"
import { BASKET_TARGET_ID } from "./bagFlight"
import { ShoppingBasket, X } from "lucide-react"

import useBagBasketStore, { useBasketBags } from "@/store/bagBasketStore"

/**
 * The basket, floating over the inventory while bags are being picked.
 *
 * Deliberately always present in selection mode, empty or not: it is the thing
 * that tells you what mode you are in, and an element that only appears once
 * you succeed at something is no help when you cannot work out how to.
 */
export const BagBasket = () => {
  const navigate = useNavigate()
  const isSelecting = useBagBasketStore((state) => state.isSelecting)
  const cancelSelection = useBagBasketStore((state) => state.cancelSelection)
  const removeBag = useBagBasketStore((state) => state.removeBag)
  const bags = useBasketBags()

  const totalWeight = bags.reduce((sum, bag) => sum + bag.weightGrams, 0)

  return (
    <>
      <BagFlightLayer />
      {/* initial={false}: the bar should not fly in when the page first paints,
          only when selection mode is entered. */}
      <AnimatePresence initial={false}>
        {isSelecting && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="sticky top-4 z-50 mx-auto w-full max-w-3xl px-4"
          >
            <div className="bg-background flex items-center gap-4 rounded-lg border p-3 shadow-lg">
              <div className="relative shrink-0" id={BASKET_TARGET_ID}>
                <motion.div
                  // The basket itself takes the delivery: a single settle as the
                  // count changes, so a ghost landing has something to land into.
                  animate={{ scale: bags.length > 0 ? [1, 1.12, 1] : 1 }}
                  key={bags.length}
                  transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }}
                >
                  <ShoppingBasket className="h-8 w-8" strokeWidth={2} />
                </motion.div>
                <AnimatePresence initial={false}>
                  {bags.length > 0 && (
                    <motion.span
                      key="count"
                      initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                      exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                      className="bg-primary text-primary-foreground absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
                    >
                      {bags.length}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>

              <div className="min-w-0 flex-1">
                {bags.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Pick the bags you want to send for testing.
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium tabular-nums">
                      {bags.length} bag{bags.length === 1 ? "" : "s"} ·{" "}
                      {totalWeight}g
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <AnimatePresence initial={false}>
                        {bags.map((bag) => (
                          <motion.button
                            key={bag.subBatchId}
                            layout
                            type="button"
                            initial={{ scale: 0.25, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            // Softer than the enter, and a small shift rather
                            // than collapsing height, so neighbours settle
                            // instead of snapping.
                            exit={{ opacity: 0, y: -4 }}
                            transition={{
                              type: "spring",
                              duration: 0.3,
                              bounce: 0,
                            }}
                            onClick={() => removeBag(bag.subBatchId)}
                            title="Remove from basket"
                            className={cn(
                              "bg-muted hover:bg-muted/70 group flex items-center gap-1",
                              "rounded px-2 py-1 font-mono text-xs",
                              "transition-[background-color,scale] duration-150 ease-out",
                              "active:scale-[0.96]",
                            )}
                          >
                            {bag.batchCode ?? "—"}
                            <span className="text-muted-foreground tabular-nums">
                              {bag.weightGrams}g
                            </span>
                            <X className="h-3 w-3 opacity-40 transition-opacity duration-150 ease-out group-hover:opacity-100" />
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  </>
                )}
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={cancelSelection}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={bags.length === 0}
                  onClick={() =>
                    navigate({ to: "/inventory/send-for-testing" })
                  }
                >
                  Review
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
