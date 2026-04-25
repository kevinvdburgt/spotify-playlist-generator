const BASE = "https://api.spotify.com/v1";

export class SpotifyClient {
  constructor(private accessToken: string) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${BASE}${path}`;
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "1");
        await sleep((retryAfter + 1) * 1000);
        continue;
      }
      if (res.status >= 500 && res.status < 600) {
        await sleep(2 ** attempt * 500);
        continue;
      }
      if (res.status === 204) return undefined as T;
      if (!res.ok) {
        throw new Error(`Spotify ${init.method ?? "GET"} ${path} → ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as T;
    }
    throw new Error(`Spotify ${init.method ?? "GET"} ${path}: exhausted retries`);
  }

  async getAll<T>(path: string, itemsKey = "items", limit = 50): Promise<T[]> {
    const sep = path.includes("?") ? "&" : "?";
    let next: string | null = `${path}${sep}limit=${limit}`;
    const out: T[] = [];
    while (next) {
      const page: any = await this.request(next);
      const container = itemsKey in page ? page : page;
      const items: T[] = container[itemsKey] ?? [];
      out.push(...items);
      next = container.next ?? null;
    }
    return out;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
