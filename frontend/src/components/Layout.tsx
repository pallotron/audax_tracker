import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSyncContext } from "../context/SyncContext";
import appIcon from "../assets/app-icon.png";
import CloudSyncIcon from "./CloudSyncIcon";
import CloudSyncConsentDialog from "./CloudSyncConsentDialog";
import CloudSyncDisableDialog from "./CloudSyncDisableDialog";
import { BackupTransferButton } from "./BackupTransferButton";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "text-orange-600 font-medium"
    : "text-gray-600 hover:text-gray-900";

export default function Layout() {
  const { isAuthenticated, tokens, logout } = useAuth();
  const { geocoding, cloudSync, sync, syncing, checking, hasPending, progress, rateLimitWait, lastSync } = useSyncContext();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {isAuthenticated && (
        <nav className="bg-white shadow">
          <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-20 items-center justify-between">
              <div className="flex items-center space-x-8">
                <NavLink to="/" className="flex items-center">
                  <img src={appIcon} alt="Audax Tracker" className="h-12 w-12 rounded-xl" />
                </NavLink>
                <NavLink to="/dashboard" className={navLinkClass}>Dashboard</NavLink>
                <NavLink to="/activities" className={navLinkClass}>Activities</NavLink>
                <NavLink to="/awards" className={navLinkClass}>Awards</NavLink>
                <NavLink to="/yearly" className={navLinkClass}>Audax Yearly Summary</NavLink>
                <NavLink to="/about" className={navLinkClass}>About</NavLink>
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
                  <CloudSyncIcon
                    sync={cloudSync}
                    onRetry={cloudSync.retry}
                    onDisable={() => setShowDisableDialog(true)}
                  />
                  {!cloudSync.enabled && (
                    <button
                      onClick={() => setShowConsentDialog(true)}
                      className="rounded-md border border-orange-300 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                      title="Enable cloud sync to back up your annotations across devices"
                    >
                      Enable sync
                    </button>
                  )}
                  <BackupTransferButton />
                  {lastSync && !syncing && !checking && (
                    <span className="text-xs text-gray-400" title={new Date(lastSync).toLocaleString()}>
                      Synced {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                  <button
                    onClick={sync}
                    disabled={syncing || checking}
                    className="relative inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {hasPending && !syncing && (
                      <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-300 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-400" />
                      </span>
                    )}
                    {syncing ? (
                      <>
                        <svg className="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {progress ? `${progress.fetched} fetched` : rateLimitWait ? "Rate limited…" : "Syncing…"}
                      </>
                    ) : checking ? "Checking…" : hasPending ? "Sync now" : "Sync"}
                  </button>
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
      {showDisableDialog && (
        <CloudSyncDisableDialog
          onKeep={() => { void cloudSync.disable(false); setShowDisableDialog(false); }}
          onDelete={() => { void cloudSync.disable(true); setShowDisableDialog(false); }}
          onCancel={() => setShowDisableDialog(false)}
        />
      )}
      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
