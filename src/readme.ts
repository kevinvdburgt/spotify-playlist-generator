import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Track } from "./spotify/playlists";

const README_PATH = "README.md";
const SNAPSHOT_DIR = "playlists";
const START_MARKER = "<!-- todays playlist -->";
const END_MARKER = "<!-- /todays playlist -->";

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

export function writeSnapshot(date: string, body: string): string {
  if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const rel = join(SNAPSHOT_DIR, `${date}.md`);
  const content = `# Playlist — ${date}\n\n${body}`;
  atomicWrite(rel, content);
  return rel;
}

export function updateReadmeLatest(snapshotRelPath: string, date: string, body: string): void {
  const block = `${START_MARKER}\n> Latest snapshot: [${date}](${snapshotRelPath})\n\n${body}${END_MARKER}`;
  let readme = existsSync(README_PATH) ? readFileSync(README_PATH, "utf8") : "";
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    readme = readme.slice(0, startIdx) + block + readme.slice(endIdx + END_MARKER.length);
  } else {
    const sep = readme.length === 0 || readme.endsWith("\n") ? "" : "\n";
    readme = `${readme}${sep}\n## Today's playlist\n\n${block}\n`;
  }
  atomicWrite(README_PATH, readme);
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
