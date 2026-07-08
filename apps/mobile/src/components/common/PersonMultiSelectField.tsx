import { useAuth } from "@/hooks/useAuth"
import { usePersons } from "@/hooks/usePersons"
import { Label } from "@nasti/ui/label"
import { MultiSelect, Option } from "@nasti/ui/multi-select"
import { useEffect, useMemo } from "react"

type PersonMultiSelectFieldProps = {
  organisationId?: string | null
  value: string[]
  onChange: (value: string[]) => void
  defaultToCurrentUser?: boolean
}

export const PersonMultiSelectField = ({
  organisationId,
  value,
  onChange,
  defaultToCurrentUser = false,
}: PersonMultiSelectFieldProps) => {
  const { user } = useAuth()
  const { data: persons } = usePersons(organisationId)

  useEffect(() => {
    if (!defaultToCurrentUser || value.length > 0 || !persons || !user?.id)
      return

    const currentPerson = persons.find(
      (person) => person.source_type === "user" && person.user_id === user.id,
    )
    if (currentPerson) onChange([currentPerson.id])
  }, [defaultToCurrentUser, onChange, persons, user?.id, value.length])

  const options: Option[] = useMemo(
    () =>
      persons
        ?.filter((person) => person.is_active || value.includes(person.id))
        .map((person) => ({
          value: person.id,
          label: person.display_name,
        })) ?? [],
    [persons, value],
  )

  return (
    <div className="space-y-2">
      <Label>People present</Label>
      <MultiSelect
        options={options}
        onValueChange={onChange}
        value={value}
        defaultValue={value}
        placeholder="Select people"
      />
    </div>
  )
}
