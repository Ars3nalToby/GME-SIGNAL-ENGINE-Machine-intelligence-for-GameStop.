// After `next build`: the client bundle (.next/static) must contain no secret names or values (SPEC §12).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), ".next/static");
if (!fs.existsSync(root)) {
  console.error("No .next/static — run `npm run build` first.");
  process.exit(2);
}

// load .env.local (if any) so *values* can be checked as well as names
const env = { ...process.env };
for (const f of [".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const SECRET_NAMES = ["X_BEARER_TOKEN", "MARKET_DATA_API_KEY", "MARKET_DATA_PROVIDER", "DASHBOARD_PASSWORD", "SEC_USER_AGENT", "POSITION_JSON"];
const needles = SECRET_NAMES.map((n) => ({ what: `name ${n}`, s: n }));
for (const n of SECRET_NAMES) {
  const v = env[n];
  if (v && v.length >= 6 && !/^[{}\s":,0-9a-z]*$/.test(v.slice(0, 2) + "") ) needles.push({ what: `value of ${n}`, s: v });
  else if (v && v.length >= 6) needles.push({ what: `value of ${n}`, s: v });
}
needles.push({ what: "NEXT_PUBLIC_ variable", s: "NEXT_PUBLIC_" });

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map|txt)$/.test(e.name)) files.push(p);
  }
})(root);

let hits = 0;
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const n of needles) {
    if (text.includes(n.s)) {
      hits++;
      console.error(`LEAK  ${n.what}  in  ${path.relative(process.cwd(), f)}`);
    }
  }
}
console.log(`scanned ${files.length} client files for ${needles.length} patterns (${SECRET_NAMES.length} names, ${needles.length - SECRET_NAMES.length - 1} values present in env)`);
if (hits) process.exit(1);
console.log("OK: no secret names or values in .next/static");
