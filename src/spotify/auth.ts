export async function getAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  return tokenRequest(opts.clientId, opts.clientSecret, {
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
  });
}

export async function getClientCredentialsToken(opts: {
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  return tokenRequest(opts.clientId, opts.clientSecret, {
    grant_type: "client_credentials",
  });
}

async function tokenRequest(
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}
