import { getAppMeta } from "@nasti/common/authClaims"
import {
  hasOrgPermission,
  parseOrgPermissions,
} from "@nasti/common/permissions"
import type { OrgPermission, Role } from "@nasti/common/types"
import type { Session } from "@supabase/supabase-js"

export type AccessContext = {
  role: Role | null
  permissions: OrgPermission[]
}

// Claims come straight off the session so this works offline and inside
// beforeLoad, where there is no hook to call.
export const accessFromSession = (
  session: Session | null | undefined,
): AccessContext => {
  const meta = getAppMeta(session)
  return {
    role: meta.role ?? null,
    permissions: parseOrgPermissions(meta.permissions),
  }
}

export const canAccess = (
  { role, permissions }: AccessContext,
  permission: OrgPermission,
) => hasOrgPermission(role, permissions, permission)

// Every screen in the PWA today is a collections screen. Inventory support is
// coming: when it lands, add "inventory" here and gate the inventory routes
// individually with canAccess(access, "inventory").
export const PWA_AREAS: readonly OrgPermission[] = ["collections"]

export const canUseApp = (access: AccessContext) =>
  PWA_AREAS.some((permission) => canAccess(access, permission))
