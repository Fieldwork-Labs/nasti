import { create } from "zustand"
import { supabase } from "@nasti/common/supabase"
import { Session, User } from "@supabase/supabase-js"
import { Organisation, Role, ROLE } from "@nasti/common/types"

type OrgFields = [
  "id",
  "name",
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
}

type UserState = {
  isInitialized: boolean
  user: User | null
  session: Session | null
  organisation: OrgData | null
  role: Role | null
  isAdmin: boolean
  setUser: (user: User) => void
  setSession: (session: Session) => void
  setOrg: (organisation: OrgData) => void
  setRole: (role: Role) => void
  getUser: () => Promise<AuthDetails | null>
  getSession: () => Promise<Session | null>
  logout: () => Promise<void>
}

const useUserStore = create<UserState>((set) => ({
  isInitialized: false,
  user: null,
  session: null,
  orgId: null,
  organisation: null,
  role: null,
  isAdmin: false,
  setUser: (user: User) => set({ user }),
  setSession: (session: Session) => set({ session }),
  setOrg: (organisation: OrgData) => set({ organisation }),
  setRole: (role: Role) => {
    set({ role })
    if (role === ROLE.ADMIN) set({ isAdmin: true })
  },
  getUser: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      set({ user })
      // Fetch organization and role
      const { data: orgUserData, error: orgError } = await supabase
        .from("org_user")
        .select(
          `*, organisation(
            "id",
            "name",
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

        set({
          organisation,
          role,
          isInitialized: true,
          isAdmin: role === ROLE.ADMIN,
        })
        return { user, organisation, isAdmin: role === ROLE.ADMIN }
      }
    }
    // No user found - still set initialized
    set({ isInitialized: true })
    return { user, organisation: null, isAdmin: null }
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
    })
  },
}))

export default useUserStore
