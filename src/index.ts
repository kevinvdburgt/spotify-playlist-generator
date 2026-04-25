import { Blacklist } from "./blacklist";
import { loadConfig, type PlaylistConfig } from "./config";
import { processFavourites } from "./favourites";
import { passesFilters } from "./filters";
import { getAccessToken, getClientCredentialsToken } from "./spotify/auth";
import { SpotifyClient } from "./spotify/client";
import { discoverCandidates } from "./spotify/discover";
import {
  getPlaylistTracks,
  getTracksByIds,
  replacePlaylistTracks,
  type Track,
} from "./spotify/playlists";
import { renderPlaylistMarkdown, writeSnapshot, type PlaylistSection } from "./snapshot";
import { loadState, saveState } from "./state";

const DRY_RUN = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const clientId = required("SPOTIFY_CLIENT_ID");
  const clientSecret = required("SPOTIFY_CLIENT_SECRET");
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  const config = loadConfig();
  const blacklist = Blacklist.load();

  let accessToken: string;
  if (refreshToken) {
    accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  } else if (DRY_RUN) {
    console.log("(dry-run) no refresh token — using client_credentials (read-only)");
    accessToken = await getClientCredentialsToken({ clientId, clientSecret });
  } else {
    throw new Error("Missing required env var: SPOTIFY_REFRESH_TOKEN");
  }
  const client = new SpotifyClient(accessToken);

  let failures = 0;
  const sections: PlaylistSection[] = [];
  for (const playlist of config.playlists) {
    try {
      const picks = await processPlaylist({
        client,
        playlist,
        market: config.defaults.market,
        defaultTracksPerRun: config.defaults.tracks_per_run,
        blacklist,
      });
      if (picks.length > 0) sections.push({ playlistName: playlist.name, tracks: picks });
    } catch (err) {
      failures++;
      console.error(`✗ ${playlist.name} (${playlist.id}): ${(err as Error).message}`);
    }
  }

  if (!DRY_RUN) {
    if (blacklist.save()) console.log("blacklist.yaml updated");
    const date = new Date().toISOString().slice(0, 10);
    let snapshotRel: string | null = null;
    if (sections.length > 0) {
      const body = renderPlaylistMarkdown(sections, date);
      snapshotRel = writeSnapshot(date, body);
      console.log(`wrote ${snapshotRel}`);
    }
    try {
      const newFavs = await processFavourites({ client, runDate: date, snapshotRel });
      if (newFavs.length > 0) console.log(`favourites: +${newFavs.length} new`);
    } catch (err) {
      console.warn(`favourites: skipped (${(err as Error).message})`);
    }
  } else {
    console.log("(dry-run) skipping file writes");
  }

  if (failures > 0) {
    console.error(`${failures} playlist(s) failed`);
    process.exit(1);
  }
}

async function processPlaylist(args: {
  client: SpotifyClient;
  playlist: PlaylistConfig;
  market: string;
  defaultTracksPerRun: number;
  blacklist: Blacklist;
}): Promise<Track[]> {
  const { client, playlist, market, defaultTracksPerRun, blacklist } = args;
  const limit = playlist.tracks_per_run ?? defaultTracksPerRun;

  console.log(`\n▶ ${playlist.name} (${playlist.id})`);

  // 1. Fetch current playlist tracks (full objects so we can record removals).
  let currentIds = new Set<string>();
  try {
    const current = await getPlaylistTracks(client, playlist.id);
    currentIds = new Set(current.map((t) => t.id));
  } catch (err) {
    console.warn(`  could not read playlist (${(err as Error).message}) — skipping removal diff`);
  }

  // 2. Diff against last-known state to detect manual removals.
  const prev = loadState(playlist.id);
  if (prev && currentIds.size > 0) {
    const removedIds = prev.track_ids.filter((id) => !currentIds.has(id));
    if (removedIds.length > 0) {
      console.log(`  detected ${removedIds.length} removed track(s) → blacklisting`);
      const removedTracks = await getTracksByIds(client, removedIds);
      for (const t of removedTracks) blacklist.add(t, playlist.name);
    }
  } else {
    console.log("  no prior state — first run, skipping removal diff");
  }

  // 3. Discover candidates.
  const candidates = await discoverCandidates({ client, playlist, market });
  console.log(`  ${candidates.length} candidates discovered`);

  // 4. Filter.
  const filtered = candidates.filter(
    (t) => !blacklist.has(t.id) && passesFilters(t, playlist.filters),
  );
  console.log(`  ${filtered.length} candidates after filters`);

  // 5. Pick top N — sort by popularity desc, then release date desc, then random tiebreak.
  filtered.sort((a, b) => {
    if (b.popularity !== a.popularity) return b.popularity - a.popularity;
    return b.album.release_date.localeCompare(a.album.release_date);
  });
  const picks = pickDiverse(filtered, limit);
  console.log(`  ${picks.length} picks: ${summarize(picks)}`);

  // 6. Replace playlist (refresh mode).
  if (DRY_RUN) {
    console.log("  (dry-run) skipping replace + state save");
    return [];
  }

  if (picks.length === 0) {
    console.log("  no picks — leaving playlist untouched");
    return [];
  }

  await replacePlaylistTracks(
    client,
    playlist.id,
    picks.map((t) => t.uri),
  );

  // 7. Save new state.
  saveState({
    playlist_id: playlist.id,
    playlist_name: playlist.name,
    track_ids: picks.map((t) => t.id),
    updated_at: new Date().toISOString(),
  });
  console.log("  ✓ playlist replaced + state saved");
  return picks;
}

// Spread picks across artists so one artist doesn't dominate.
function pickDiverse(tracks: Track[], n: number): Track[] {
  const out: Track[] = [];
  const perArtistCap = Math.max(1, Math.ceil(n / 4));
  const counts = new Map<string, number>();
  for (const t of tracks) {
    if (out.length >= n) break;
    const key = t.artists[0]?.id ?? t.artists[0]?.name ?? "_";
    const c = counts.get(key) ?? 0;
    if (c >= perArtistCap) continue;
    counts.set(key, c + 1);
    out.push(t);
  }
  if (out.length < n) {
    for (const t of tracks) {
      if (out.length >= n) break;
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

function summarize(tracks: Track[]): string {
  if (tracks.length === 0) return "(none)";
  const names = tracks.slice(0, 3).map((t) => `${t.artists[0]?.name ?? "?"} – ${t.name}`);
  const tail = tracks.length > 3 ? `, +${tracks.length - 3}` : "";
  return names.join(" · ") + tail;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
