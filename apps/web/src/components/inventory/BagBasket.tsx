import { Button } from "@nasti/ui/button"
import { cn } from "@nasti/ui/utils"
import { useNavigate } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
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
    <AnimatePresence>
      {isSelecting && (
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="sticky top-4 z-50 mx-auto w-full max-w-3xl px-4"
        >
          <div className="bg-background flex items-center gap-4 rounded-lg border p-3 shadow-lg">
            <div className="relative shrink-0">
              <ShoppingBasket className="h-8 w-8" />
              {bags.length > 0 && (
                <motion.span
                  key={bags.length}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  className="bg-primary text-primary-foreground absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums"
                >
                  {bags.length}
                </motion.span>
              )}
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
                    {bags.map((bag) => (
                      <button
                        key={bag.subBatchId}
                        type="button"
                        onClick={() => removeBag(bag.subBatchId)}
                        title="Remove from basket"
                        className={cn(
                          "bg-muted hover:bg-muted/70 group flex items-center gap-1",
                          "rounded px-2 py-0.5 font-mono text-xs",
                        )}
                      >
                        {bag.batchCode ?? "—"}
                        <span className="text-muted-foreground">
                          {bag.weightGrams}g
                        </span>
                        <X className="h-3 w-3 opacity-40 group-hover:opacity-100" />
                      </button>
                    ))}
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
                onClick={() => navigate({ to: "/inventory/send-for-testing" })}
              >
                Review
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
