import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import type { Track } from "./spotify/playlists";

const BLACKLIST_PATH = "blacklist.yaml";

const EntrySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  artists: z.array(z.string()),
  removed_at: z.string(),
  from_playlist: z.string(),
});

const FileSchema = z.object({
  tracks: z.array(EntrySchema).default([]),
});

export type BlacklistEntry = z.infer<typeof EntrySchema>;

export class Blacklist {
  private byId: Map<string, BlacklistEntry>;
  private dirty = false;

  constructor(private entries: BlacklistEntry[]) {
    this.byId = new Map(entries.map((e) => [e.id, e]));
  }

  static load(): Blacklist {
    if (!existsSync(BLACKLIST_PATH)) return new Blacklist([]);
    const raw = readFileSync(BLACKLIST_PATH, "utf8").trim();
    if (!raw) return new Blacklist([]);
    const parsed = FileSchema.parse(parseYaml(raw) ?? { tracks: [] });
    return new Blacklist(parsed.tracks);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  add(track: Track, fromPlaylist: string): void {
    if (this.byId.has(track.id)) return;
    const entry: BlacklistEntry = {
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      removed_at: new Date().toISOString(),
      from_playlist: fromPlaylist,
    };
    this.byId.set(entry.id, entry);
    this.entries.push(entry);
    this.dirty = true;
  }

  save(): boolean {
    if (!this.dirty) return false;
    const yaml = stringifyYaml({ tracks: this.entries });
    writeFileSync(BLACKLIST_PATH, yaml);
    this.dirty = false;
    return true;
  }
}
