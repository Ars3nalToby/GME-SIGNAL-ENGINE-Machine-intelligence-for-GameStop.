import fs from "node:fs";
import path from "node:path";
export const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

export type Route = [RegExp, (url: string) => Response | Promise<Response> | undefined];

import { vi } from "vitest";

/** Stub global fetch with URL-pattern routes; unmatched URLs return 404. Returns the recorded URL list. */
export function stubFetch(routes: Route[]): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      for (const [re, h] of routes) {
        if (re.test(url)) {
          const r = await h(url);
          if (r) return r;
        }
      }
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}
export const text = (body: string, status = 200) => new Response(body, { status });
export const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
