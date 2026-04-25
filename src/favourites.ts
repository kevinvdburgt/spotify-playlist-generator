import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { appendFavouriteRows, renderFavouriteRow } from "./snapshot";
import type { SpotifyClient } from "./spotify/client";
import type { Track } from "./spotify/playlists";

const FAVOURITES_STATE_PATH = join("state", "favourites.json");

type SavedTrackItem = { added_at: string; track: Track | null };

export type FavouritesState = {
  track_ids: string[];
  entries: Array<{
    id: string;
    added_at: string;
    detected_on: string;
    snapshot_path: string | null;
  }>;
  updated_at: string;
};

export async function getSavedTracks(client: SpotifyClient): Promise<SavedTrackItem[]> {
  return client.getAll<SavedTrackItem>("/me/tracks", "items", 50);
}

export function loadFavouritesState(): FavouritesState {
  if (!existsSync(FAVOURITES_STATE_PATH)) {
    return { track_ids: [], entries: [], updated_at: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(FAVOURITES_STATE_PATH, "utf8")) as FavouritesState;
}

export function saveFavouritesState(state: FavouritesState): void {
  mkdirSync(dirname(FAVOURITES_STATE_PATH), { recursive: true });
  writeFileSync(FAVOURITES_STATE_PATH, JSON.stringify(state, null, 2) + "\n");
}

export async function processFavourites(args: {
  client: SpotifyClient;
  runDate: string;
  snapshotRel: string | null;
}): Promise<Track[]> {
  const { client, runDate, snapshotRel } = args;

  const saved = await getSavedTracks(client);
  const state = loadFavouritesState();
  const known = new Set(state.track_ids);

  const newItems = saved.filter((i) => i.track?.id && !known.has(i.track.id));
  if (newItems.length === 0) return [];

  // Spotify returns newest first; append oldest first so the file reads chronologically.
  newItems.reverse();

  const newTracks: Track[] = [];
  const rows: string[] = [];
  for (const item of newItems) {
    const t = item.track;
    if (!t) continue;
    newTracks.push(t);
    rows.push(renderFavouriteRow(t, snapshotRel));
    state.entries.push({
      id: t.id,
      added_at: item.added_at,
      detected_on: runDate,
      snapshot_path: snapshotRel,
    });
    state.track_ids.push(t.id);
  }

  appendFavouriteRows(rows);
  state.updated_at = new Date().toISOString();
  saveFavouritesState(state);
  return newTracks;
}
