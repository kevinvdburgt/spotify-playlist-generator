import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const SourceEnum = z.enum(["search", "categories", "new_releases"]);

const FiltersSchema = z
  .object({
    year_from: z.number().int().min(1900).max(2100).optional(),
    year_to: z.number().int().min(1900).max(2100).optional(),
    popularity_min: z.number().int().min(0).max(100).optional(),
    popularity_max: z.number().int().min(0).max(100).optional(),
    duration_ms_min: z.number().int().min(0).optional(),
    duration_ms_max: z.number().int().min(0).optional(),
  })
  .strict()
  .default({});

const PlaylistSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    genres: z.array(z.string().min(1)).min(1),
    sources: z.array(SourceEnum).min(1).default(["search"]),
    filters: FiltersSchema,
    tracks_per_run: z.number().int().min(1).max(100).optional(),
  })
  .strict();

const DefaultsSchema = z
  .object({
    tracks_per_run: z.number().int().min(1).max(100).default(10),
    market: z.string().length(2).default("NL"),
  })
  .strict()
  .default({ tracks_per_run: 10, market: "NL" });

export const ConfigSchema = z
  .object({
    defaults: DefaultsSchema,
    playlists: z.array(PlaylistSchema).min(1),
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
export type PlaylistConfig = z.infer<typeof PlaylistSchema>;
export type Filters = z.infer<typeof FiltersSchema>;

export function loadConfig(path = "config.yaml"): Config {
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw);
  return ConfigSchema.parse(parsed);
}
