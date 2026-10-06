// Fails if data/capital-structure.json has a non-null field without a source (SPEC §11.5).
import fs from "node:fs";

const file = process.argv[2] ?? "data/capital-structure.json";
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const errors = [];

const FIELDS = ["name", "type", "principal", "coupon", "maturity", "conversionRate", "conversionPrice", "conversionConditions", "capitalledCap", "repurchases", "outstanding"];
const sourced = (inst, field) => (inst.sources ?? []).some((s) => s.field === field && s.label && s.url && s.accession);
const requireSource = (inst, field, label) => {
  const v = inst[field];
  if (v === null || v === undefined || (Array.isArray(v) && v.length === 0)) return;
  if (!sourced(inst, field)) errors.push(`${label}: field "${field}" has a value but no source {field,label,url,accession,section}`);
};

if (!Array.isArray(data.instruments)) errors.push('"instruments" must be an array');
for (const [i, inst] of (data.instruments ?? []).entries()) {
  const label = `instruments[${i}] ${inst.name ?? "(unnamed)"}`;
  for (const f of FIELDS) requireSource(inst, f, label);
  if (!inst.verifiedAt) errors.push(`${label}: missing verifiedAt`);
  for (const s of inst.sources ?? []) if (!/^https:\/\/www\.sec\.gov\//.test(s.url ?? "")) errors.push(`${label}: source url must be a sec.gov URL (${s.url})`);
}
const w = data.warrants;
if (w) {
  for (const f of ["outstanding", "exercisePrice", "sharesPerWarrant", "expiry"]) {
    if (w[f] != null && !(w.sources ?? []).some((s) => s.field === f && s.url && s.accession)) errors.push(`warrants: field "${f}" has a value but no source`);
  }
}
if (data.instruments?.length && !data.verifiedAt) errors.push("top-level verifiedAt missing");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`OK: ${data.instruments?.length ?? 0} instrument(s) checked, every non-null field is sourced${data.instruments?.length ? "" : " (file is empty: nothing curated yet)"}`);
