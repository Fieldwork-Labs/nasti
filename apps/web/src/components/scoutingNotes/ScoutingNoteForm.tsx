import { Controller } from "react-hook-form"

import { FormField } from "@nasti/ui/formField"
import {
  ScoutingNoteFormProps,
  useScoutingNoteFormContext,
} from "./ScoutingNoteFormContext"
import useUserStore from "@/store/userStore"
import { CollectorsField } from "../common/CollectorsField"
import { LocationFields } from "../common/LocationFields"
import { PhenologyField } from "../common/PhenologyField"
import { SpeciesInputSection } from "../common/SpeciesInputSection"

export const ScoutingNoteForm = ({ form, tripId }: ScoutingNoteFormProps) => {
  const {
    register,
    control,
    formState: { errors },
  } = form

  const { scoutingNote, setShowLocationMap } = useScoutingNoteFormContext()
  const { user } = useUserStore()

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SpeciesInputSection form={form} tripId={tripId} />

        <LocationFields
          form={form}
          onSelectOnMap={() => setShowLocationMap(true)}
        />

        {/* Description */}
        <FormField
          label="Description"
          type="textarea"
          autoComplete="off"
          {...register("description")}
          error={errors.description}
        />

        <Controller
          control={control}
          name="person_ids"
          render={({ field }) => (
            <CollectorsField
              collectorUserId={scoutingNote?.created_by ?? user?.id}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <PhenologyField form={form} />
      </div>
      {errors.root && (
        <div className="flex h-4 justify-end text-xs text-orange-800">
          {errors.root.message}
        </div>
      )}
    </div>
  )
}
