import { createFileRoute } from "@tanstack/react-router"

import { Link, Outlet, useNavigate } from "@tanstack/react-router"
import useUserStore from "@/store/userStore"
import { supabase } from "@/lib/supabase"

const Dashboard = () => {
  const { user, role } = useUserStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate({ to: "/auth/login" })
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            {/* Left side - Logo and Links */}
            <div className="flex">
              <Link to="/" className="flex-shrink-0 flex items-center">
                <img className="h-8 w-8" src="/logo.svg" alt="Logo" />
                <span className="ml-2 font-bold text-xl">NASTI</span>
              </Link>
              <nav className="hidden sm:ml-6 sm:flex sm:space-x-8">
                <Link
                  to="/dashboard"
                  className="text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 border-indigo-500 text-sm font-medium"
                >
                  Dashboard
                </Link>
                <Link
                  to="/trips"
                  className="text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium"
                >
                  Trips
                </Link>
                <Link
                  to="/species"
                  className="text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium"
                >
                  Species
                </Link>
                {role === "admin" && (
                  <Link
                    to="/invitations"
                    className="text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 border-transparent text-sm font-medium"
                  >
                    Invitations
                  </Link>
                )}
              </nav>
            </div>
            {/* Right side - User Menu */}
            <div className="flex items-center">
              {user ? (
                <div className="ml-4 relative">
                  <button
                    onClick={handleLogout}
                    className="bg-white text-gray-800 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <Link
                  to="/auth/login"
                  className="bg-indigo-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-indigo-700"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow bg-gray-100">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white shadow mt-auto">
        <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} NASTI Project. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}

export const Route = createFileRoute("/_private/layout")({
  component: Dashboard,
})
