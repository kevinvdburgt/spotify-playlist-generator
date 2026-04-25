import type { SpotifyClient } from "./client";

export type Track = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    release_date: string;
    images: { url: string; width: number | null; height: number | null }[];
  };
  popularity: number;
  duration_ms: number;
  uri: string;
  external_urls: { spotify: string };
};

type PlaylistTrackItem = { track: Track | null };

export async function getPlaylistTrackIds(client: SpotifyClient, playlistId: string): Promise<string[]> {
  const items = await client.getAll<PlaylistTrackItem>(
    `/playlists/${playlistId}/tracks?fields=items(track(id,name,artists(id,name))),next`,
    "items",
    100,
  );
  return items.map((i) => i.track?.id).filter((id): id is string => Boolean(id));
}

export async function getPlaylistTracks(client: SpotifyClient, playlistId: string): Promise<Track[]> {
  const items = await client.getAll<PlaylistTrackItem>(
    `/playlists/${playlistId}/tracks`,
    "items",
    100,
  );
  return items.map((i) => i.track).filter((t): t is Track => Boolean(t?.id));
}

export async function replacePlaylistTracks(
  client: SpotifyClient,
  playlistId: string,
  trackUris: string[],
): Promise<void> {
  // PUT replaces with up to 100 items; subsequent batches use POST to append.
  const first = trackUris.slice(0, 100);
  await client.request(`/playlists/${playlistId}/tracks`, {
    method: "PUT",
    body: JSON.stringify({ uris: first }),
  });
  for (let i = 100; i < trackUris.length; i += 100) {
    const chunk = trackUris.slice(i, i + 100);
    await client.request(`/playlists/${playlistId}/tracks`, {
      method: "POST",
      body: JSON.stringify({ uris: chunk }),
    });
  }
}

export async function getTracksByIds(client: SpotifyClient, ids: string[]): Promise<Track[]> {
  const out: Track[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await client.request<{ tracks: (Track | null)[] }>(`/tracks?ids=${chunk.join(",")}`);
    out.push(...res.tracks.filter((t): t is Track => Boolean(t?.id)));
  }
  return out;
}
