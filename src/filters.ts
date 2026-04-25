import type { Filters } from "./config";
import type { Track } from "./spotify/playlists";

export function parseReleaseYear(release_date: string): number | null {
  const m = /^(\d{4})/.exec(release_date);
  return m ? Number(m[1]) : null;
}

export function passesFilters(track: Track, f: Filters): boolean {
  if (f.year_from != null || f.year_to != null) {
    const y = parseReleaseYear(track.album.release_date);
    if (y == null) return false;
    if (f.year_from != null && y < f.year_from) return false;
    if (f.year_to != null && y > f.year_to) return false;
  }
  if (f.popularity_min != null && track.popularity < f.popularity_min) return false;
  if (f.popularity_max != null && track.popularity > f.popularity_max) return false;
  if (f.duration_ms_min != null && track.duration_ms < f.duration_ms_min) return false;
  if (f.duration_ms_max != null && track.duration_ms > f.duration_ms_max) return false;
  return true;
}
