import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const STATE_DIR = "state";

export type PlaylistState = {
  playlist_id: string;
  playlist_name: string;
  track_ids: string[];
  updated_at: string;
};

function statePath(playlistId: string): string {
  return join(STATE_DIR, `${playlistId}.json`);
}

export function loadState(playlistId: string): PlaylistState | null {
  const p = statePath(playlistId);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as PlaylistState;
}

export function saveState(state: PlaylistState): void {
  const p = statePath(state.playlist_id);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + "\n");
}
