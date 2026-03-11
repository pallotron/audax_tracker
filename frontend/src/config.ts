export const config = {
  stravaClientId: import.meta.env.VITE_STRAVA_CLIENT_ID as string,
  oauthWorkerUrl: import.meta.env.VITE_OAUTH_WORKER_URL as string,
  oauthCallbackUrl: import.meta.env.VITE_OAUTH_CALLBACK_URL as string,
};
