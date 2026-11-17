import { supabase } from "@nasti/common/supabase"
import { z } from "zod"

// Trip data only needs the name associated with a collector ID.
export const orgMembersSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string().nullable(),
  }),
)
export type OrgMember = z.infer<typeof orgMembersSchema>[number]

/** Prefix of every roster query, for defaults and clean-up. */
export const ORG_MEMBERS_QUERY_KEY = ["people", "list"] as const

/**
 * The roster holds the names of the signed-in account's organisation
 * members, so it is cached per account. On a shared device the
 * next account to sign in must never read the previous one's roster.
 */
export const orgMembersQueryKey = (userId: string | undefined) =>
  [...ORG_MEMBERS_QUERY_KEY, userId ?? null] as const

export const fetchOrgMembers = async () => {
  const { data, error } = await supabase.rpc("get_organisation_users")
  // Throw so a failed refresh (no reception) keeps the last roster instead of
  // replacing it with an empty result. TanStack records the error without
  // advancing dataUpdatedAt, so the roster refetches once back online.
  if (error) throw error
  return orgMembersSchema.parse(data)
}
