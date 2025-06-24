import { create } from "zustand"
import { supabase } from "@nasti/common/supabase"
import { Session, User } from "@supabase/supabase-js"
import { Role, ROLE } from "@nasti/common/types"

export type AuthDetails = {
  user: User | null
  orgId: string | null
  isAdmin: boolean | null
}

type UserState = {
  user: User | null
  session: Session | null
  orgId: string | null
  role: Role | null
  isAdmin: boolean
  setUser: (user: User) => void
  setSession: (session: Session) => void
  setOrgId: (orgId: string) => void
  setRole: (role: Role) => void
  getUser: () => Promise<AuthDetails | null>
  getSession: () => Promise<Session | null>
  logout: () => Promise<void>
}

const useUserStore = create<UserState>((set) => ({
  user: null,
  session: null,
  orgId: null,
  role: null,
  isAdmin: false,
  setUser: (user: User) => set({ user }),
  setSession: (session: Session) => set({ session }),
  setOrgId: (orgId: string) => set({ orgId }),
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
      const { data: orgData, error: orgError } = await supabase
        .from("org_user")
        .select("*")
        .eq("user_id", user.id)
        .single()

      if (orgError) {
        console.error("Error fetching organization:", orgError)
      } else {
        const { role, organisation_id: orgId } = orgData

        set({
          orgId,
          role,
          isAdmin: role === ROLE.ADMIN,
        })
        return { user, orgId, isAdmin: role === ROLE.ADMIN }
      }
    }
    return { user, orgId: null, isAdmin: null }
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
      orgId: null,
      role: null,
      isAdmin: false,
    })
  },
}))

export default useUserStore
