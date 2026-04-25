import type { PlaylistConfig } from "../config";
import type { SpotifyClient } from "./client";
import { getTracksByIds, type Track } from "./playlists";

type DiscoverArgs = {
  client: SpotifyClient;
  playlist: PlaylistConfig;
  market: string;
};

export async function discoverCandidates(args: DiscoverArgs): Promise<Track[]> {
  const { client, playlist, market } = args;
  const sources = playlist.sources;
  const buckets: Track[][] = [];

  if (sources.includes("search")) {
    buckets.push(await fromSearch(client, playlist, market));
  }
  if (sources.includes("categories")) {
    buckets.push(await fromCategoryPlaylists(client, playlist, market));
  }
  if (sources.includes("new_releases")) {
    buckets.push(await fromNewReleases(client, playlist, market));
  }

  const seen = new Set<string>();
  const merged: Track[] = [];
  for (const bucket of buckets) {
    for (const t of bucket) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      merged.push(t);
    }
  }
  return merged;
}

async function fromSearch(
  client: SpotifyClient,
  playlist: PlaylistConfig,
  market: string,
): Promise<Track[]> {
  const f = playlist.filters;
  const yearClause =
    f.year_from != null || f.year_to != null
      ? ` year:${f.year_from ?? 1900}-${f.year_to ?? 2100}`
      : "";

  const out: Track[] = [];
  const PAGES = 3;
  const LIMIT = 50;
  for (const genre of playlist.genres) {
    const q = encodeURIComponent(`genre:"${genre}"${yearClause}`);
    for (let page = 0; page < PAGES; page++) {
      const offset = page * LIMIT;
      try {
        const res = await client.request<{ tracks: { items: Track[] } }>(
          `/search?q=${q}&type=track&market=${market}&limit=${LIMIT}&offset=${offset}`,
        );
        const items = res.tracks?.items ?? [];
        if (items.length === 0) break;
        out.push(...items);
        if (items.length < LIMIT) break;
      } catch (err) {
        console.warn(`  search "${genre}" offset ${offset} failed: ${(err as Error).message}`);
        break;
      }
    }
  }
  return out;
}

const GENRE_TO_CATEGORY: Record<string, string> = {
  hardstyle: "edm_dance",
  hardcore: "edm_dance",
  frenchcore: "edm_dance",
  "hard dance": "edm_dance",
  techno: "edm_dance",
  trance: "edm_dance",
  drum_and_bass: "edm_dance",
  "drum and bass": "edm_dance",
  dubstep: "edm_dance",
  rock: "rock",
  metal: "metal",
  pop: "pop",
  rap: "hiphop",
  "hip hop": "hiphop",
  hiphop: "hiphop",
  jazz: "jazz",
  classical: "classical",
};

async function fromCategoryPlaylists(
  client: SpotifyClient,
  playlist: PlaylistConfig,
  market: string,
): Promise<Track[]> {
  const cats = new Set(
    playlist.genres
      .map((g) => GENRE_TO_CATEGORY[g.toLowerCase()])
      .filter((c): c is string => Boolean(c)),
  );
  if (cats.size === 0) return [];

  const out: Track[] = [];
  for (const cat of cats) {
    let playlists: { id: string }[];
    try {
      const res = await client.request<{ playlists: { items: { id: string }[] } }>(
        `/browse/categories/${cat}/playlists?country=${market}&limit=20`,
      );
      playlists = res.playlists?.items ?? [];
    } catch (err) {
      console.warn(`  categories ${cat} failed: ${(err as Error).message}`);
      continue;
    }

    for (const pl of playlists.slice(0, 5)) {
      try {
        const res = await client.request<{ items: { track: Track | null }[] }>(
          `/playlists/${pl.id}/tracks?limit=100&market=${market}`,
        );
        for (const it of res.items) {
          if (it.track?.id) out.push(it.track);
        }
      } catch {
        // playlist may be private/unavailable; skip
      }
    }
  }
  return out;
}

async function fromNewReleases(
  client: SpotifyClient,
  playlist: PlaylistConfig,
  market: string,
): Promise<Track[]> {
  const wanted = new Set(playlist.genres.map((g) => g.toLowerCase()));
  let albums: { id: string; artists: { id: string }[] }[];
  try {
    const res = await client.request<{
      albums: { items: { id: string; artists: { id: string }[] }[] };
    }>(`/browse/new-releases?country=${market}&limit=50`);
    albums = res.albums?.items ?? [];
  } catch (err) {
    console.warn(`  new-releases failed: ${(err as Error).message}`);
    return [];
  }

  // Resolve genres via artist lookups, batched.
  const artistIds = Array.from(new Set(albums.flatMap((a) => a.artists.map((ar) => ar.id))));
  const artistGenres = new Map<string, string[]>();
  for (let i = 0; i < artistIds.length; i += 50) {
    const chunk = artistIds.slice(i, i + 50);
    try {
      const res = await client.request<{ artists: { id: string; genres: string[] }[] }>(
        `/artists?ids=${chunk.join(",")}`,
      );
      for (const a of res.artists) artistGenres.set(a.id, a.genres);
    } catch (err) {
      console.warn(`  artists batch failed: ${(err as Error).message}`);
    }
  }

  const matchingAlbumIds = albums
    .filter((a) =>
      a.artists.some((ar) =>
        (artistGenres.get(ar.id) ?? []).some((g) => wanted.has(g.toLowerCase())),
      ),
    )
    .map((a) => a.id);

  if (matchingAlbumIds.length === 0) return [];

  const trackIds: string[] = [];
  for (let i = 0; i < matchingAlbumIds.length; i += 20) {
    const chunk = matchingAlbumIds.slice(i, i + 20);
    try {
      const res = await client.request<{
        albums: { tracks: { items: { id: string }[] } }[];
      }>(`/albums?ids=${chunk.join(",")}&market=${market}`);
      for (const al of res.albums) {
        for (const t of al.tracks?.items ?? []) {
          if (t.id) trackIds.push(t.id);
        }
      }
    } catch (err) {
      console.warn(`  albums batch failed: ${(err as Error).message}`);
    }
  }

  if (trackIds.length === 0) return [];
  return getTracksByIds(client, trackIds);
}
