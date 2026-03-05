import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { isAuthenticated, tokens, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center space-x-8">
              <Link to="/" className="text-xl font-bold text-gray-900">
                Audax Tracker
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to="/dashboard"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/activities"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Activities
                  </Link>
                  <Link
                    to="/yearly"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Yearly Summary
                  </Link>
                </>
              )}
            </div>
            {isAuthenticated && tokens && (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {tokens.athlete.firstname}
                </span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
