import { create } from "zustand"
import { supabase } from "@nasti/common/supabase"
import { Session, User } from "@supabase/supabase-js"
import { Organisation, OrgPermission, Role, ROLE } from "@nasti/common/types"
import {
  hasOrgPermission,
  parseOrgPermissions,
} from "@nasti/common/permissions"

type OrgFields = [
  "id",
  "name",
  "is_testing_provider",
  "contact_address",
  "contact_email",
  "contact_name",
  "contact_phone",
]

type OrgData = Pick<Organisation, OrgFields[number]>

export type AuthDetails = {
  user: User | null
  organisation: OrgData | null
  isAdmin: boolean | null
  role: Role | null
  permissions: OrgPermission[]
}

type UserState = {
  isInitialized: boolean
  user: User | null
  session: Session | null
  organisation: OrgData | null
  role: Role | null
  isAdmin: boolean
  permissions: OrgPermission[]
  hasPermission: (permission: OrgPermission) => boolean
  setUser: (user: User) => void
  setSession: (session: Session) => void
  setOrg: (organisation: OrgData) => void
  setRole: (role: Role) => void
  setPermissions: (permissions: OrgPermission[]) => void
  getUser: () => Promise<AuthDetails | null>
  getSession: () => Promise<Session | null>
  logout: () => Promise<void>
}

const useUserStore = create<UserState>((set, get) => ({
  isInitialized: false,
  user: null,
  session: null,
  orgId: null,
  organisation: null,
  role: null,
  isAdmin: false,
  permissions: [],
  hasPermission: (permission: OrgPermission) => {
    const { role, permissions } = get()
    return hasOrgPermission(role, permissions, permission)
  },
  setUser: (user: User) => set({ user }),
  setSession: (session: Session) => set({ session }),
  setOrg: (organisation: OrgData) => set({ organisation }),
  setRole: (role: Role) => {
    set({ role })
    if (role === ROLE.ADMIN) set({ isAdmin: true })
  },
  setPermissions: (permissions: OrgPermission[]) => set({ permissions }),
  getUser: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      set({ user })
      // Fetch organization, role and permissions
      const { data: orgUserData, error: orgError } = await supabase
        .from("org_user")
        .select(
          `*, organisation(
            "id",
            "name",
            "is_testing_provider",
            "contact_address",
            "contact_email",
            "contact_name",
            "contact_phone"
          )`,
        )
        .eq("user_id", user.id)
        .single()

      if (orgError) {
        console.error("Error fetching org user data:", orgError)
        // No user found - still set initialized
        set({ isInitialized: true })
      } else {
        const { role, organisation } = orgUserData
        const permissions = parseOrgPermissions(orgUserData.permissions)
        const isAdmin = role === ROLE.ADMIN

        set({
          organisation,
          role,
          permissions,
          isInitialized: true,
          isAdmin,
        })
        return { user, organisation, isAdmin, role, permissions }
      }
    }
    // No user found - still set initialized
    set({ isInitialized: true })
    return {
      user,
      organisation: null,
      isAdmin: null,
      role: null,
      permissions: [],
    }
  },
  getSession: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      set({ session })
    }
    return session
  },
  logout: async () => {
    await supabase.auth.signOut()
    set({
      user: null,
      session: null,
      organisation: null,
      role: null,
      isAdmin: false,
      permissions: [],
    })
  },
}))

export default useUserStore
