export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: {
    id: number;
    firstname: string;
    lastname: string;
  };
}

const TOKENS_KEY = "audax_strava_tokens";

export function getStravaAuthUrl(
  clientId: string,
  callbackUrl: string
): string {
  const state = btoa(window.location.origin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export async function refreshAccessToken(
  workerUrl: string,
  refreshToken: string
): Promise<StravaTokens> {
  const response = await fetch(`${workerUrl}/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }
  return response.json();
}

export function saveTokens(tokens: StravaTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function loadTokens(): StravaTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export function isTokenExpired(tokens: StravaTokens): boolean {
  return tokens.expires_at < Math.floor(Date.now() / 1000);
}
