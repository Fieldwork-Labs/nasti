import { useMemo } from "react"
import { useAuth } from "./useAuth"
import { usePersons } from "./usePersons"

export const useCurrentUserPerson = (organisationId?: string | null) => {
  const { user } = useAuth()
  const { data: persons } = usePersons(organisationId)

  return useMemo(
    () =>
      persons?.find(
        (person) =>
          person.source_type === "user" && person.user_id === user?.id,
      ),
    [persons, user?.id],
  )
}
