/** Source URLs are untrusted data: only ever render http(s) links. */
export function safeHref(u: string | undefined | null): string | undefined {
  if (!u) return undefined;
  try {
    const x = new URL(u);
    return x.protocol === "https:" || x.protocol === "http:" ? x.toString() : undefined;
  } catch {
    return undefined;
  }
}
