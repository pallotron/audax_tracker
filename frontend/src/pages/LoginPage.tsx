import { Link } from "react-router-dom";
import { getStravaAuthUrl } from "../strava/auth";
import { config } from "../config";
import appIcon from "../assets/app-icon.png";
import connectWithStrava from "../assets/btn_strava_connect_with_orange.svg";

export default function LoginPage() {
  const authUrl = getStravaAuthUrl(config.stravaClientId, config.oauthCallbackUrl);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <img src={appIcon} alt="Audax Tracker" className="mb-6 h-32 w-32 rounded-2xl shadow-lg" />
      <h1 className="mb-4 text-4xl font-bold text-gray-900">Audax Tracker</h1>
      <p className="mb-8 text-lg text-gray-600">
        Track your randonneuring activities and qualifications
      </p>
      <a href={authUrl} className="hover:opacity-80">
        <img src={connectWithStrava} alt="Connect with Strava" height={48} className="h-12" />
      </a>
      <Link to="/about" className="mt-4 text-sm text-gray-500 hover:text-gray-700 underline">
        How does this work?
      </Link>
    </div>
  );
}
