import { create } from "zustand"
import { supabase } from "../lib/supabase"
import { Session, User } from "@supabase/supabase-js"
import { Role } from "../types"


type UserState = {
  user: User | null
  session: Session | null
  orgId: string | null
  role: Role | null
  setUser: (user: User) => void
  setOrgId: (orgId: string) => void
  setRole: (role: Role) => void
  getUser: () => Promise<void>
  getSession: () => Promise<void>
  logout: () => Promise<void>
}

const useUserStore = create<UserState>((set) => ({
  user: null,
  session: null,
  orgId: null,
  role: null,
  setUser: (user: User) => set({ user }),
  setOrgId: (orgId: string) => set({ orgId }),
  setRole: (role: Role) => set({ role }),
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
        set({
          orgId: orgData.organisation_id,
          role: orgData.role as Role | null,
        })
      }
    }
  },
  getSession: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session) {
      set({ session })
    }
  },
  logout: async () => {
    await supabase.auth.signOut()
    set({
      user: null,
      session: null,
      orgId: null,
      role: null
    })
  }
}))

export default useUserStore
