import { useAuth } from "@/hooks/useAuth"
import { usePersons } from "@/hooks/usePersons"
import { Label } from "@nasti/ui/label"
import { MultiSelect, type Option } from "@nasti/ui/multi-select"
import { useEffect, useMemo } from "react"

type PersonMultiSelectFieldProps = {
  organisationId?: string | null
  value: string[]
  onChange: (value: string[]) => void
  defaultToCurrentUser?: boolean
  displayCurrentUser?: boolean
  label?: string
}

export const PersonMultiSelectField = ({
  organisationId,
  value,
  onChange,
  defaultToCurrentUser = false,
  displayCurrentUser = false,
  label = "People present",
}: PersonMultiSelectFieldProps) => {
  const { user } = useAuth()
  const { data: persons } = usePersons(organisationId)
  const currentUserPerson = useMemo(
    () =>
      persons?.find(
        (person) =>
          person.source_type === "user" && person.user_id === user?.id,
      ),
    [persons, user?.id],
  )

  useEffect(() => {
    if (!defaultToCurrentUser || value.length > 0 || !persons || !user?.id)
      return

    const currentPerson = persons.find(
      (person) => person.source_type === "user" && person.user_id === user.id,
    )
    if (currentPerson) onChange([currentPerson.id])
  }, [defaultToCurrentUser, onChange, persons, user?.id, value.length])

  const currentUserPersonId = currentUserPerson?.id
  const selectedValue = useMemo(() => {
    if (!displayCurrentUser || !currentUserPersonId) return value
    return [
      currentUserPersonId,
      ...value.filter((personId) => personId !== currentUserPersonId),
    ]
  }, [currentUserPersonId, displayCurrentUser, value])

  const handleChange = (nextValue: string[]) => {
    if (!displayCurrentUser || !currentUserPersonId) {
      onChange(nextValue)
      return
    }

    onChange(nextValue.filter((personId) => personId !== currentUserPersonId))
  }

  const options: Option[] = useMemo(
    () =>
      persons
        ?.filter(
          (person) =>
            person.is_active ||
            selectedValue.includes(person.id) ||
            person.id === currentUserPersonId,
        )
        .map((person) => ({
          value: person.id,
          label: person.display_name,
        })) ?? [],
    [currentUserPersonId, persons, selectedValue],
  )

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <MultiSelect
        options={options}
        onValueChange={handleChange}
        value={selectedValue}
        defaultValue={selectedValue}
        placeholder="Select people"
      />
    </div>
  )
}
