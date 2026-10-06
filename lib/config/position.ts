import "server-only";
import { z } from "zod";

const Deadline = z.string().nullable();
const PositionSchema = z.object({
  shares: z.record(z.string(), z.number().nonnegative()).default({}),
  warrants: z.record(z.string(), z.number().nonnegative()).default({}),
  /** ISO local datetime; without an offset it is read as Brisbane time. null = not set. */
  warrantDeadlines: z.record(z.string(), Deadline).default({}),
});

export type Position = {
  status: "set" | "empty" | "invalid";
  error?: string;
  venues: string[];
  shares: Record<string, number>;
  warrants: Record<string, number>;
  warrantDeadlines: Record<string, string | null>;
  totalShares: number;
  totalWarrants: number;
};

/** Server-only: reads POSITION_JSON (never committed). Totals are computed, not typed in. */
export function readPosition(raw: string | undefined = process.env.POSITION_JSON): Position {
  const empty: Position = { status: "empty", venues: [], shares: {}, warrants: {}, warrantDeadlines: {}, totalShares: 0, totalWarrants: 0 };
  if (!raw || !raw.trim()) return empty;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ...empty, status: "invalid", error: "POSITION_JSON is not valid JSON" };
  }
  const parsed = PositionSchema.safeParse(json);
  if (!parsed.success) return { ...empty, status: "invalid", error: "POSITION_JSON does not match the expected shape" };
  const { shares, warrants, warrantDeadlines } = parsed.data;
  const venues = [...new Set([...Object.keys(shares), ...Object.keys(warrants), ...Object.keys(warrantDeadlines)])];
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const totalShares = sum(shares);
  const totalWarrants = sum(warrants);
  if (venues.length === 0 || (totalShares === 0 && totalWarrants === 0)) return { ...empty, venues, shares, warrants, warrantDeadlines };
  return { status: "set", venues, shares, warrants, warrantDeadlines, totalShares, totalWarrants };
}
