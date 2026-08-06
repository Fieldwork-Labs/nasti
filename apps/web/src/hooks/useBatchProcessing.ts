// Re-export treatment hooks with old processing names for backward compatibility
import {
  useTreatmentHistory,
  useTreatmentEvent,
  useCollectionTreatmentHistory,
  type TreatmentWithDetails,
} from "./useBatchTreating"

export type BatchProcessingWithDetails = TreatmentWithDetails

export const useBatchProcessingHistory = useTreatmentHistory
export const useBatchProcessingEvent = useTreatmentEvent
export const useCollectionProcessingHistory = useCollectionTreatmentHistory
