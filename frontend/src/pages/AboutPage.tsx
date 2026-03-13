import { useState } from "react";
import { Link } from "react-router-dom";
import appIcon from "../assets/app-icon.png";
import angeloPhoto from "../assets/angelo.jpeg";
import { useAuth } from "../context/AuthContext";
import { getStravaAuthUrl } from "../strava/auth";
import { config } from "../config";
import { useSyncContext } from "../context/SyncContext";
import CloudSyncConsentDialog from "../components/CloudSyncConsentDialog";
import CloudSyncDisableDialog from "../components/CloudSyncDisableDialog";

export default function AboutPage() {
  const { isAuthenticated } = useAuth();
  const authUrl = getStravaAuthUrl(config.stravaClientId, config.oauthCallbackUrl);
  const { cloudSync } = useSyncContext();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        <img src={appIcon} alt="Audax Tracker" className="mb-4 h-24 w-24 rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-gray-900">Audax Tracker</h1>
        <p className="mt-2 text-lg text-gray-500">
          Track your randonneuring activities and progress toward annual and lifetime awards
        </p>
        <a
          href="https://github.com/pallotron/audax_tracker"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
          pallotron/audax_tracker
        </a>
        <p className="mt-2 text-sm text-gray-400">
          Open source — fork it and run your own instance.
        </p>
        <a
          href="https://ko-fi.com/angelofailla"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#FF5E5B] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#e54f4c]"
        >
          ☕ Buy me a coffee
        </a>
      </div>

      <div className="space-y-8">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">What is Audax Tracker?</h2>
          <p className="text-gray-600">
            Audax Tracker is a personal tool for randonneurs to track their long-distance cycling
            activities and monitor progress toward ACP (Audax Club Parisien) qualification goals.
            It connects to your Strava account, imports your rides, and automatically classifies
            them as Brevets de Randonneurs Mondiaux (BRM) events, Flèche, PBP, or other
            randonneuring events.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">How it works</h2>
          <ol className="list-decimal space-y-3 pl-5 text-gray-600">
            <li>
              <span className="font-medium text-gray-800">Connect with Strava</span> — sign in with
              your Strava account to give Audax Tracker read access to your activities.
            </li>
            <li>
              <span className="font-medium text-gray-800">Sync your rides</span> — the app fetches
              all your Strava activities and stores them locally in your browser. Your data never
              leaves your device.
            </li>
            <li>
              <span className="font-medium text-gray-800">Auto-classification</span> — activities
              are automatically classified by matching their name (e.g. "BRM 200 Dublin") or
              distance against known event types: BRM200, BRM300, BRM400, BRM600, BRM1000, Flèche,
              PBP, and RM1200+.
            </li>
            <li>
              <span className="font-medium text-gray-800">Review and correct</span> — on the
              Activities page you can confirm auto-classified events, manually set the event type,
              mark rides as DNF (Did Not Finish), or add homologation numbers (retrievable from{" "}
              <a
                href="https://myaccount.audax-club-parisien.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline"
              >
                Audax Club Parisien
              </a>
              ).
            </li>
            <li>
              <span className="font-medium text-gray-800">Track awards</span> — the Dashboard and
              award pages show your progress toward annual awards (Super Randonneur, RRTY, Brevet
              2000/5000, 4 Provinces, Easter Flèche) and lifetime awards (4 Nations SR, ISR).
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Annual awards</h2>
          <p className="mb-3 text-sm text-gray-500">Tracked per season (November–October).</p>
          <div className="space-y-3">
            {[
              {
                name: "Super Randonneur",
                desc: "Complete a 200, 300, 400, and 600 km brevet in the same season. SR600 counts as the 600.",
              },
              {
                name: "RRTY — Randonneur Round The Year",
                desc: "Ride at least one qualifying event (≥200 km) every month for 12 consecutive months.",
              },
              {
                name: "Brevet 2000 / 5000",
                desc: "Accumulate 2,000 or 5,000 km from brevet-type rides in a single season.",
              },
              {
                name: "4 Provinces of Ireland",
                desc: "Complete a qualifying ride starting in each of the four provinces (Ulster, Leinster, Munster, Connacht) in the same season.",
              },
              {
                name: "Easter Flèche",
                desc: "Complete a Flèche event during the Easter weekend (Good Friday to Easter Monday).",
              },
            ].map(({ name, desc }) => (
              <div key={name} className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="font-semibold text-gray-800">{name}</h3>
                <p className="mt-1 text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Lifetime awards</h2>
          <div className="space-y-3">
            {[
              {
                name: "4 Nations Super Randonneur",
                desc: "Complete a 200, 300, 400, and 600 km brevet each in a different nation: Ireland, England, Scotland, and Wales.",
              },
              {
                name: "International Super Randonneur (ISR)",
                desc: "Complete a 200, 300, 400, and 600 km brevet each in a different country.",
              },
              {
                name: "International rides log",
                desc: "A chronological log of qualifying rides held outside Ireland.",
              },
            ].map(({ name, desc }) => (
              <div key={name} className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="font-semibold text-gray-800">{name}</h3>
                <p className="mt-1 text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">About the author</h2>
          <div className="flex flex-col gap-4">
            <img
              src={angeloPhoto}
              alt="Angelo Failla"
              className="w-full rounded-xl object-cover shadow"
            />
            <div>
              <p className="text-gray-600">
                Hi, I'm Angelo — an Audax Ireland member since 2019. I built this app to keep track
                of my own randonneuring progress after finding myself lost in spreadsheets. I've
                completed multiple SR series, the Rocky Road to Dublin SR600,{" "}
                <a
                  href="https://www.strava.com/activities/2647579112"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:underline"
                >
                  Paris-Brest-Paris 2019
                </a>{" "}
                (DNF, knee issues) and{" "}
                <a
                  href="https://www.strava.com/activities/9715990200"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:underline"
                >
                  2023
                </a>
                , the{" "}
                <a
                  href="https://www.angelofailla.com/posts/2025/06/04/celtic_knot_report/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:underline"
                >
                  Celtic Knot 1000 (blog post)
                </a>{" "}
                (1,000 km across Ireland in three days), and attempted{" "}
                <a
                  href="https://www.angelofailla.com/posts/2025/08/10/lel25/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-600 hover:underline"
                >
                  London–Edinburgh–London 2025 (blog post)
                </a>{" "}
                before a crash and Storm Floris had other ideas.
              </p>
              <a
                href="https://www.audaxireland.org/2025/07/meet-the-audaxers-angelo-failla/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm text-orange-600 hover:underline"
              >
                Read my Audax Ireland profile →
              </a>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Privacy</h2>
          <p className="text-gray-600">
            By default, all your activity data is stored locally in your browser using IndexedDB.
            Nothing is sent to any external server beyond the initial Strava sync. Clearing your
            browser data will remove all stored activities. Optionally, you can enable cloud sync
            (see below) to back up your annotations across devices.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Cloud Sync</h2>
          <p className="mb-3 text-gray-600">
            Optionally sync your activity annotations (event types, DNF flags, homologation numbers)
            across devices. Your Strava activity data, GPS tracks, and personal information are never
            stored in the cloud — only the annotations you create within Audax Tracker.
          </p>
          {isAuthenticated && (cloudSync.enabled ? (
            <button
              onClick={() => setShowDisableDialog(true)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Disable cloud sync
            </button>
          ) : (
            <button
              onClick={() => setShowConsentDialog(true)}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Enable cloud sync
            </button>
          ))}
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
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Strava API Policy</h2>
          <p className="text-gray-600">
            Audax Tracker complies with the{" "}
            <a
              href="https://www.strava.com/legal/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline"
            >
              Strava API Agreement
            </a>
            . Strava activity data — including names, distances, GPS tracks, and other Strava content —
            is stored only in your local browser and is never uploaded to any external server. The
            optional cloud sync feature stores only user-generated annotations: data you have created
            within Audax Tracker, not data retrieved from Strava. You can permanently delete your
            cloud data at any time using the Cloud Sync settings above.
          </p>
        </section>
      </div>

      <div className="mt-10 text-center">
        {isAuthenticated ? (
          <Link
            to="/dashboard"
            className="rounded-lg bg-orange-500 px-6 py-3 text-lg font-semibold text-white shadow hover:bg-orange-600"
          >
            Go to Dashboard
          </Link>
        ) : (
          <a
            href={authUrl}
            className="rounded-lg bg-orange-500 px-6 py-3 text-lg font-semibold text-white shadow hover:bg-orange-600"
          >
            Connect with Strava
          </a>
        )}
      </div>
    </div>
  );
}
