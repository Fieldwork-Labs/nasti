import useUserStore from "@/store/userStore"
import { useNavigate } from "@tanstack/react-router"

export const useAdminOnly = () => {
  const { isAdmin } = useUserStore()
  const navigate = useNavigate()
  if (!isAdmin) navigate({ to: "/trips" })
}
