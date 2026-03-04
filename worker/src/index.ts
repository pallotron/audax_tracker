export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("Audax OAuth Worker", { status: 200 });
  },
};

interface Env {
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
  ALLOWED_ORIGIN: string;
}
