import { Link } from "react-router-dom";
import appIcon from "../assets/app-icon.png";
import { useAuth } from "../context/AuthContext";
import { getStravaAuthUrl } from "../strava/auth";
import { config } from "../config";

export default function AboutPage() {
  const { isAuthenticated } = useAuth();
  const authUrl = getStravaAuthUrl(config.stravaClientId, config.redirectUri);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-10 flex flex-col items-center text-center">
        <img src={appIcon} alt="Audax Tracker" className="mb-4 h-24 w-24 rounded-2xl shadow-lg" />
        <h1 className="text-3xl font-bold text-gray-900">Audax Tracker</h1>
        <p className="mt-2 text-lg text-gray-500">
          Track your randonneuring activities and qualification progress
        </p>
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
              mark rides as DNF (Did Not Finish), or use bulk actions to process many activities
              at once.
            </li>
            <li>
              <span className="font-medium text-gray-800">Track qualifications</span> — the
              Dashboard shows your progress toward the ACP 5000 km and ACP 10000 km Super Randonneur
              awards, including which requirements are met and which events are at risk of expiring
              outside the qualification window (4 years for R5000, 6 years for R10000).
            </li>
          </ol>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Qualification requirements</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="font-semibold text-gray-800">ACP Super Randonneur 5000 km</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>Complete a full BRM series: 200 + 300 + 400 + 600 + 1000 km</li>
                <li>Complete Paris-Brest-Paris (PBP, 1200 km)</li>
                <li>Complete a Flèche event</li>
                <li>Accumulate at least 5000 km total across qualifying events</li>
                <li>All events must fall within a rolling 4-year window</li>
              </ul>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="font-semibold text-gray-800">ACP Super Randonneur 10000 km</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
                <li>Complete two full BRM series (200 + 300 + 400 + 600 + 1000 km each)</li>
                <li>Complete Paris-Brest-Paris (PBP)</li>
                <li>Complete a Flèche event</li>
                <li>Complete a separate RM 1200+ event (not PBP)</li>
                <li>Complete a mountain 600 km (BRM600 with at least 8500 m elevation gain)</li>
                <li>Accumulate at least 10000 km total across qualifying events</li>
                <li>All events must fall within a rolling 6-year window</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-gray-800">Privacy</h2>
          <p className="text-gray-600">
            All your activity data is stored locally in your browser using IndexedDB. Nothing is
            sent to any external server beyond the initial Strava sync. Clearing your browser data
            will remove all stored activities.
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
