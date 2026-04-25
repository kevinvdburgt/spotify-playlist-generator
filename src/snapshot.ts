import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Track } from "./spotify/playlists";

const SNAPSHOT_DIR = "playlists";
const FAVOURITES_FILE = "FAVOURITE.md";
const FAVOURITES_HEADER =
  "# Favourites\n\n_Tracks added to your Spotify Liked Songs, accumulated over time._\n\n" +
  "| Cover | Title | Artist | Added In |\n| --- | --- | --- | --- |\n";

export type PlaylistSection = { playlistName: string; tracks: Track[] };

export function renderPlaylistMarkdown(sections: PlaylistSection[], date: string): string {
  const parts: string[] = [`_Generated ${date}_`, ""];
  for (const { playlistName, tracks } of sections) {
    parts.push(`## ${escapeMd(playlistName)}`, "");
    if (tracks.length === 0) {
      parts.push("_(no picks this run)_", "");
      continue;
    }
    parts.push("| Cover | Title | Artist |", "| --- | --- | --- |");
    for (const t of tracks) {
      const cover = pickCover(t);
      const coverCell = cover
        ? `<img src="${cover}" width="64" height="64" alt="">`
        : "";
      const titleCell = `[${escapeCell(t.name)}](${t.external_urls.spotify})`;
      const artistCell = escapeCell(t.artists.map((a) => a.name).join(", "));
      parts.push(`| ${coverCell} | ${titleCell} | ${artistCell} |`);
    }
    parts.push("");
  }
  return parts.join("\n").trimEnd() + "\n";
}

function pickCover(t: Track): string | null {
  const imgs = t.album.images ?? [];
  if (imgs.length === 0) return null;
  const small = [...imgs]
    .filter((i) => (i.width ?? 0) >= 64)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))[0];
  return (small ?? imgs[imgs.length - 1]!).url;
}

function escapeCell(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function escapeMd(s: string): string {
  return s.replace(/\n/g, " ");
}

export function renderFavouriteRow(t: Track, snapshotRel: string | null): string {
  const cover = pickCover(t);
  const coverCell = cover ? `<img src="${cover}" width="64" height="64" alt="">` : "";
  const titleCell = `[${escapeCell(t.name)}](${t.external_urls.spotify})`;
  const artistCell = escapeCell(t.artists.map((a) => a.name).join(", "));
  const addedCell = snapshotRel
    ? `[${snapshotPathToDate(snapshotRel)}](./${snapshotRel})`
    : "—";
  return `| ${coverCell} | ${titleCell} | ${artistCell} | ${addedCell} |`;
}

function snapshotPathToDate(rel: string): string {
  const base = rel.split("/").pop() ?? rel;
  return base.replace(/\.md$/, "");
}

export function appendFavouriteRows(rows: string[]): void {
  if (rows.length === 0) return;
  const existing = existsSync(FAVOURITES_FILE)
    ? readFileSync(FAVOURITES_FILE, "utf8")
    : FAVOURITES_HEADER;
  const trimmed = existing.endsWith("\n") ? existing : existing + "\n";
  const next = trimmed + rows.join("\n") + "\n";
  atomicWrite(FAVOURITES_FILE, next);
}

export function writeSnapshot(date: string, body: string): string {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const rel = join(SNAPSHOT_DIR, `${date}.md`);
  const content = `# Playlist — ${date}\n\n${body}`;
  atomicWrite(rel, content);
  return rel;
}

function atomicWrite(path: string, content: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  const dir = dirname(path);
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, content);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}
