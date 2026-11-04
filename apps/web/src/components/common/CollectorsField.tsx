import { useMemo } from "react"

import { usePersons } from "@/hooks/usePersons"
import { Label } from "@nasti/ui/label"
import { MultiSelect, Option } from "@nasti/ui/multi-select"

/**
 * The people who collected an item. The collector (the user who recorded it)
 * is always listed first and can't be removed. They aren't stored in the value:
 * the record's own collector column already identifies them.
 */
export const CollectorsField = ({
  collectorUserId,
  value,
  onChange,
}: {
  collectorUserId: string | undefined
  value: string[] | undefined
  onChange: (value: string[]) => void
}) => {
  const { data: persons } = usePersons()

  const collectorPersonId = useMemo(
    () =>
      persons?.find(
        (person) =>
          person.source_type === "user" && person.user_id === collectorUserId,
      )?.id,
    [persons, collectorUserId],
  )

  const displayedValue = useMemo(
    () =>
      collectorPersonId
        ? [
            collectorPersonId,
            ...(value ?? []).filter((id) => id !== collectorPersonId),
          ]
        : (value ?? []),
    [collectorPersonId, value],
  )

  const options: Option[] = useMemo(
    () =>
      persons
        ?.filter(
          (person) =>
            person.is_active ||
            displayedValue.includes(person.id) ||
            person.id === collectorPersonId,
        )
        .map((person) => ({
          value: person.id,
          label: person.job_role
            ? `${person.display_name} (${person.job_role})`
            : person.display_name,
        })) ?? [],
    [persons, displayedValue, collectorPersonId],
  )

  return (
    <div className="space-y-2">
      <Label>Collectors</Label>
      <MultiSelect
        options={options}
        onValueChange={(next) =>
          onChange(next.filter((id) => id !== collectorPersonId))
        }
        value={displayedValue}
        defaultValue={displayedValue}
        placeholder="Select people"
      />
    </div>
  )
}
