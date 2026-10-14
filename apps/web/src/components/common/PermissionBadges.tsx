import { Badge } from "@nasti/ui/badge"
import {
  ORG_PERMISSION_LABELS,
  ROLE,
  type OrgPermission,
  type Role,
} from "@nasti/common/types"

type PermissionBadgesProps = {
  role: Role
  permissions: OrgPermission[] | null
}

export const PermissionBadges = ({
  role,
  permissions,
}: PermissionBadgesProps) => {
  // Admins hold every permission through their role, so their stored array is
  // empty — showing "None" for them would be actively misleading.
  if (role === ROLE.ADMIN) return <Badge>All areas</Badge>

  if (!permissions || permissions.length === 0)
    return <span className="text-muted-foreground text-sm">No access</span>

  return (
    <span className="flex flex-wrap gap-1">
      {permissions.map((permission) => (
        <Badge key={permission} variant="secondary">
          {ORG_PERMISSION_LABELS[permission]}
        </Badge>
      ))}
    </span>
  )
}
