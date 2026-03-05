import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeCode } from "../strava/auth";
import { useAuth } from "../context/AuthContext";
import { config } from "../config";

export default function OAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("No authorization code received from Strava.");
      return;
    }

    exchangeCode(config.oauthWorkerUrl, code)
      .then((tokens) => {
        login(tokens);
        navigate("/dashboard");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Token exchange failed");
      });
  }, [searchParams, login, navigate]);

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
