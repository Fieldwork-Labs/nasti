import { create } from "zustand"

/**
 * A bag picked out to send for testing.
 *
 * The identity is `subBatchId`; everything else is carried so the basket and
 * the confirmation page can render without refetching the inventory. Weights
 * are re-read from the server before sending — a basket can sit open while
 * something else changes the bag.
 */
export type BasketBag = {
  subBatchId: string
  batchId: string
  batchCode: string | null
  containerName: string | null
  /** Weight when it was added, for the basket summary only. */
  weightGrams: number
}

type BagBasketState = {
  /** Selection mode is off until the user asks for it. */
  isSelecting: boolean
  bags: Map<string, BasketBag>

  enterSelection: () => void
  /** Leaves selection mode and empties the basket. */
  cancelSelection: () => void
  toggleBag: (bag: BasketBag) => void
  removeBag: (subBatchId: string) => void
  clear: () => void
}

const useBagBasketStore = create<BagBasketState>((set) => ({
  isSelecting: false,
  bags: new Map(),

  enterSelection: () => set({ isSelecting: true }),

  cancelSelection: () => set({ isSelecting: false, bags: new Map() }),

  toggleBag: (bag) =>
    set((state) => {
      const bags = new Map(state.bags)
      if (bags.has(bag.subBatchId)) {
        bags.delete(bag.subBatchId)
      } else {
        bags.set(bag.subBatchId, bag)
      }
      return { bags }
    }),

  removeBag: (subBatchId) =>
    set((state) => {
      const bags = new Map(state.bags)
      bags.delete(subBatchId)
      return { bags }
    }),

  // Used after a successful send. Selection mode ends with the basket, because
  // the bags that were in it are no longer the caller's to select.
  clear: () => set({ isSelecting: false, bags: new Map() }),
}))

export default useBagBasketStore

/** Convenience selectors, so components do not each rebuild the same array. */
export const useBasketBags = (): BasketBag[] => {
  const bags = useBagBasketStore((state) => state.bags)
  return [...bags.values()]
}

export const useIsBagSelected = (subBatchId: string): boolean =>
  useBagBasketStore((state) => state.bags.has(subBatchId))
