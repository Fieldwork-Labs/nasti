import { useMemo } from "react"

import { usePersons } from "./usePersons"

/** The person record for the user who recorded an item, once persons load. */
export const useCollectorPersonId = (collectorUserId: string | undefined) => {
  const { data: persons } = usePersons()

  return useMemo(
    () =>
      persons?.find(
        (person) =>
          person.source_type === "user" && person.user_id === collectorUserId,
      )?.id,
    [persons, collectorUserId],
  )
}
