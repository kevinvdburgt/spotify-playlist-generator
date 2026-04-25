/**
 * One-time local OAuth helper. Run with:
 *   SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... bun run authorize
 *
 * Configure your Spotify app's redirect URI to: http://127.0.0.1:8888/callback
 * Then visit the printed URL in your browser; the refresh token is logged here.
 */
import { randomBytes } from "node:crypto";

const PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = ["playlist-modify-public", "playlist-modify-private", "playlist-read-private"];

const clientId = required("SPOTIFY_CLIENT_ID");
const clientSecret = required("SPOTIFY_CLIENT_SECRET");
const state = randomBytes(16).toString("hex");

const authUrl = new URL("https://accounts.spotify.com/authorize");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("scope", SCOPES.join(" "));
authUrl.searchParams.set("state", state);

console.log("\nOpen this URL in your browser to authorize:\n");
console.log(authUrl.toString());
console.log("\nWaiting for callback…\n");

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/callback") return new Response("Not found", { status: 404 });

    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    if (!code || returnedState !== state) {
      return new Response("Invalid callback (missing code or state mismatch).", { status: 400 });
    }

    try {
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const res = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      });
      const json = (await res.json()) as { refresh_token?: string; error?: string };
      if (!res.ok || !json.refresh_token) {
        return new Response(`Token exchange failed: ${JSON.stringify(json)}`, { status: 500 });
      }

      console.log("\n=========================================");
      console.log("SPOTIFY_REFRESH_TOKEN=" + json.refresh_token);
      console.log("=========================================\n");
      console.log("Save this as a GitHub Actions secret named SPOTIFY_REFRESH_TOKEN.");

      setTimeout(() => server.stop(), 100);
      return new Response(
        "Authorized. Refresh token printed in the terminal — you can close this tab.",
      );
    } catch (err) {
      return new Response(`Error: ${(err as Error).message}`, { status: 500 });
    }
  },
});

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}
