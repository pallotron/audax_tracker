import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { StravaTokens } from "../strava/auth";

export default function OAuthCallbackPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.slice(1); // remove leading #
    const params = new URLSearchParams(hash);

    const errorParam = params.get("error");
    if (errorParam) {
      setError(`Strava authentication failed: ${errorParam}`);
      // Clear the fragment from the URL
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    const tokensParam = params.get("tokens");
    if (!tokensParam) {
      setError("No tokens received from authentication.");
      return;
    }

    try {
      const binString = atob(tokensParam);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      const decodedString = new TextDecoder().decode(bytes);
      const tokens = JSON.parse(decodedString) as StravaTokens;
      // Clear the fragment from the URL before navigating
      window.history.replaceState(null, "", window.location.pathname);
      login(tokens);
      navigate("/dashboard");
    } catch {
      setError("Failed to parse authentication tokens.");
    }
  }, [login, navigate]);

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-lg text-red-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <p className="text-lg text-gray-600">Connecting to Strava...</p>
    </div>
  );
}
