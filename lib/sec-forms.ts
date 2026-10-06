export const FORM_LABELS: Record<string, string> = {
  "3": "Initial insider ownership",
  "4": "Insider transaction",
  "5": "Annual insider statement",
  "144": "Proposed insider sale",
  "10-Q": "Quarterly report",
  "10-K": "Annual report",
  "DEF 14A": "Proxy statement",
  "PRE 14A": "Preliminary proxy statement",
  "S-3": "Shelf registration",
  "S-3ASR": "Shelf registration",
  "S-4": "Business-combination registration",
  "S-8": "Employee plan registration",
  "SC TO-T": "Third-party tender offer",
  "SC TO-I": "Issuer tender offer",
  "SC TO-C": "Tender offer communication",
  "SC 14D9": "Target response to tender offer",
  "425": "Business-combination communication",
  "8-A12B": "Exchange listing",
  "25-NSE": "Exchange delisting",
  CORRESP: "SEC correspondence",
  UPLOAD: "SEC correspondence",
  "8-K": "Current report",
  DEFA14A: "Additional proxy materials",
  DEFC14A: "Contested proxy statement",
  PREC14A: "Preliminary contested proxy",
  DFAN14A: "Proxy soliciting material (non-management)",
};

export const ITEM_8K: Record<string, { short: string; long: string }> = {
  "1.01": { short: "Material Definitive Agreement", long: "Entry into a material definitive agreement" },
  "1.02": { short: "Termination of Material Agreement", long: "Termination of a material definitive agreement" },
  "2.01": { short: "Completion of Acquisition/Disposition", long: "Completion of acquisition or disposition of assets" },
  "2.02": { short: "Results of Operations", long: "Results of operations and financial condition (earnings)" },
  "2.03": { short: "Direct Financial Obligation", long: "Creation of a direct financial obligation (debt / convertibles)" },
  "3.02": { short: "Unregistered Equity Sales", long: "Unregistered sales of equity securities" },
  "3.03": { short: "Material Modification of Holders' Rights", long: "Material modification to rights of security holders" },
  "5.01": { short: "Change in Control", long: "Changes in control of registrant" },
  "5.02": { short: "Director/Officer Changes", long: "Departure/election of directors or officers; compensatory arrangements" },
  "5.03": { short: "Charter/Bylaw Amendments", long: "Amendments to articles of incorporation or bylaws" },
  "5.07": { short: "Shareholder Vote Results", long: "Submission of matters to a vote of security holders" },
  "7.01": { short: "Reg FD Disclosure", long: "Regulation FD disclosure" },
  "8.01": { short: "Other Events", long: "Other events" },
  "9.01": { short: "Exhibits", long: "Financial statements and exhibits" },
};

export function formLabel(form: string): string {
  const f = form.trim();
  if (FORM_LABELS[f]) return FORM_LABELS[f];
  if (/^424B\d$/i.test(f)) return "Prospectus";
  if (is13D(f)) return "Beneficial ownership report (13D)";
  if (is13G(f)) return "Beneficial ownership report (13G)";
  const base = f.replace(/\/A$/i, "");
  if (base !== f && FORM_LABELS[base]) return `${FORM_LABELS[base]} (amendment)`;
  return "SEC filing";
}

export const is13D = (f: string) => /^(SC |SCHEDULE )13D(\/A)?$/i.test(f.trim());
export const is13G = (f: string) => /^(SC |SCHEDULE )13G(\/A)?$/i.test(f.trim());
export const isAmendment = (f: string) => /\/A$/i.test(f.trim());
export const isOwnershipForm = (f: string) => ["3", "4", "5", "3/A", "4/A", "5/A"].includes(f.trim());
export const isTenderish = (f: string) => /^SC (TO-[TIC]|14D9)(\/A)?$/i.test(f.trim());
export const needsDirection = (f: string) => is13D(f) || is13G(f) || isTenderish(f) || ["425", "DEFA14A", "DEFC14A", "PREC14A", "DFAN14A"].includes(f.trim());

export function parseItems(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function title8k(items: string[]): string {
  if (items.length === 0) return "8-K · Current report";
  return `8-K · ${items.map((i) => (ITEM_8K[i] ? `${i} ${ITEM_8K[i].short}` : i)).join(" · ")}`;
}

/** The EDGAR XSL-rendered view lives in an `xsl…/` dir; the raw XML is the same file without it. */
export function rawXmlName(primaryDocument: string): string {
  return primaryDocument.replace(/^xsl[^/]*\//i, "");
}
export const isXmlDoc = (primaryDocument: string) => /\.xml$/i.test(primaryDocument);

export function cikNoZeros(cik: string): string {
  return String(cik).replace(/^0+/, "") || "0";
}
export function padCik(cik: string | number): string {
  return String(cik).replace(/\D/g, "").padStart(10, "0");
}
const base = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cikNoZeros(cik)}/${accession.replace(/-/g, "")}`;
export const docUrl = (cik: string, accession: string, doc: string) => `${base(cik, accession)}/${doc}`;
export const indexUrl = (cik: string, accession: string) => `${base(cik, accession)}/${accession}-index.htm`;
export const folderJsonUrl = (cik: string, accession: string) => `${base(cik, accession)}/index.json`;
export const folderUrl = (cik: string, accession: string, name: string) => `${base(cik, accession)}/${name}`;
export const headerTxtUrl = (cik: string, accession: string) => `https://www.sec.gov/Archives/edgar/data/${cikNoZeros(cik)}/${accession}.txt`;
