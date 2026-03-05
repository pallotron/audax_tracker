export const config = {
  stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL as string,
  redirectUri: `${window.location.origin}/callback`,
};
