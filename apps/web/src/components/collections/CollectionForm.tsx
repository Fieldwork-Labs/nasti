import { Controller } from "react-hook-form"

import { CollectionContainersInput } from "./CollectionContainersInput"

import { FormField } from "@nasti/ui/formField"
import { CheckboxGroup } from "@nasti/ui/checkboxGroup"
import {
  CollectionFormProps,
  useCollectionFormContext,
} from "./CollectionFormContext"
import useUserStore from "@/store/userStore"
import { MATERIAL_TYPE_OPTIONS } from "@nasti/common/types"
import { DurationInput } from "./DurationInput"
import { CollectorsField } from "../common/CollectorsField"
import { InfoIconWithTooltip } from "../common/InfoIconWithTooltip"
import { LocationFields } from "../common/LocationFields"
import { PhenologyField } from "../common/PhenologyField"
import { SpeciesInputSection } from "../common/SpeciesInputSection"

export const CollectionForm = ({ form, tripId }: CollectionFormProps) => {
  const {
    register,
    control,
    formState: { errors },
  } = form

  const { collection, setShowLocationMap } = useCollectionFormContext()
  const { user } = useUserStore()

  return (
    <div className="space-y-6">
      <SpeciesInputSection form={form} tripId={tripId} />

      <FormField
        label="Collected On"
        type="date"
        autoComplete="off"
        {...register("collected_on")}
        error={errors.collected_on}
      />

      <Controller
        control={control}
        name="person_ids"
        render={({ field }) => (
          <CollectorsField
            collectorUserId={collection?.collected_by ?? user?.id}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />

      <LocationFields
        form={form}
        onSelectOnMap={() => setShowLocationMap(true)}
      />

      {/* Description */}
      <FormField
        label="Description"
        autoComplete="off"
        {...register("description")}
        error={errors.description}
      />
      <CollectionContainersInput form={form} />

      <div>
        <Controller
          control={control}
          name="material_type"
          render={({ field }) => (
            <CheckboxGroup
              label={
                <span className="inline-flex items-center gap-2">
                  <span>Material Collected</span>
                  <InfoIconWithTooltip>
                    What plant material was collected. Used to pre-fill the
                    cleaning form.
                  </InfoIconWithTooltip>
                </span>
              }
              options={MATERIAL_TYPE_OPTIONS}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        {errors.material_type && (
          <div className="flex h-4 justify-end text-xs text-orange-800">
            {errors.material_type.message}
          </div>
        )}
      </div>

      <Controller
        control={control}
        name="duration"
        render={({ field }) => (
          <DurationInput value={field.value} onChange={field.onChange} />
        )}
      />

      <PhenologyField form={form} />
      {errors.root && (
        <div className="flex h-4 justify-end text-xs text-orange-800">
          {errors.root.message}
        </div>
      )}
    </div>
  )
}
