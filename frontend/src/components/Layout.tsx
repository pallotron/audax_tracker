import { useState } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSyncContext } from "../context/SyncContext";
import appIcon from "../assets/app-icon.png";
import CloudSyncIcon from "./CloudSyncIcon";
import CloudSyncConsentDialog from "./CloudSyncConsentDialog";


export default function Layout() {
  const { isAuthenticated, tokens, logout } = useAuth();
  const { geocoding, cloudSync } = useSyncContext();
  const [showConsentDialog, setShowConsentDialog] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && (
        <nav className="bg-white shadow">
          <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-20 items-center justify-between">
              <div className="flex items-center space-x-8">
                <Link to="/" className="flex items-center">
                  <img src={appIcon} alt="Audax Tracker" className="h-12 w-12 rounded-xl" />
                </Link>
                <Link to="/dashboard" className="text-gray-600 hover:text-gray-900">Dashboard</Link>
                <Link to="/activities" className="text-gray-600 hover:text-gray-900">Activities</Link>
                <Link to="/awards" className="text-gray-600 hover:text-gray-900">Awards</Link>
                <Link to="/yearly" className="text-gray-600 hover:text-gray-900">Yearly Summary</Link>
                <Link to="/about" className="text-gray-600 hover:text-gray-900">About</Link>
              </div>
              {tokens && (
                <div className="flex items-center space-x-4">
                  {geocoding && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-blue-500">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                      </span>
                      {geocoding.total > 0
                        ? `Geocoding ${geocoding.done}/${geocoding.total}`
                        : "Geocoding…"}
                    </span>
                  )}
                  <CloudSyncIcon sync={cloudSync} onRetry={cloudSync.retry} />
                  {!cloudSync.enabled && (
                    <button
                      onClick={() => setShowConsentDialog(true)}
                      className="text-xs text-gray-400 hover:text-orange-500"
                      title="Enable cloud sync to back up your annotations across devices"
                    >
                      Enable sync
                    </button>
                  )}
                  <span className="text-sm text-gray-700">{tokens.athlete?.firstname}</span>
                  <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-700">Logout</button>
                </div>
              )}
            </div>
          </div>
        </nav>
      )}
      {showConsentDialog && (
        <CloudSyncConsentDialog
          onEnable={() => { cloudSync.enable(); setShowConsentDialog(false); }}
          onDismiss={() => setShowConsentDialog(false)}
        />
      )}
      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
