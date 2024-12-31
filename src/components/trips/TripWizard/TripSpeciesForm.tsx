/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTripFormWizard } from "./useTripFormWizard"
import { TripWizardStage } from "./lib"
import { MultiSelect, Option } from "@/components/ui/multi-select"
import { useState } from "react"

export const TripSpeciesForm = () => {
  const { setCurrentStep, trip } = useTripFormWizard()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <TripWizardStage
      title="Select Target Species"
      submitLabel="Next"
      allowSubmit={true}
      isSubmitting={isSubmitting}
      onSubmit={() => void 0}
      onCancel={() => setCurrentStep(2)}
    >
      <MultiSelect
        onValueChange={() => void 0}
        options={[]}
        placeholder="Search species"
      />
      {error && <div className="text-red-500">{error}</div>}
    </TripWizardStage>
  )
}
