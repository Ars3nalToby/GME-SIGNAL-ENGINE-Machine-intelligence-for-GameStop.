import "server-only";
import * as cheerio from "cheerio";

/** Extract plain text from untrusted HTML. Never render source HTML. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  return $.root().text().replace(/\s+/g, " ").trim();
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}
