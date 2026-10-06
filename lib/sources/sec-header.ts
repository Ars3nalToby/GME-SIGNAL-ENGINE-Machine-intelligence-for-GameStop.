import "server-only";
/** SGML header of a filing's .txt: tells us who FILED BY whom / the SUBJECT COMPANY (SPEC §7.1 subject vs filer). */
export type HeaderEntity = { role: string; name: string; cik: string };
export type SecHeader = { formType?: string; entities: HeaderEntity[] };

export function parseSecHeader(text: string): SecHeader {
  const head = text.split(/<\/SEC-HEADER>/i)[0] ?? text;
  const lines = head.split(/\r?\n/);
  const entities: HeaderEntity[] = [];
  let role = "";
  let cur: HeaderEntity | undefined;
  let formType: string | undefined;
  for (const raw of lines) {
    const line = raw.replace(/\t/g, " ");
    const ft = line.match(/CONFORMED SUBMISSION TYPE:\s*(.+)$/);
    if (ft) formType = ft[1]!.trim();
    const block = raw.match(/^([A-Z][A-Z \-]+):\s*$/);
    if (block) {
      role = block[1]!.trim();
      cur = undefined;
      continue;
    }
    const name = line.match(/COMPANY CONFORMED NAME:\s*(.+)$/) ?? line.match(/OWNER CONFORMED NAME:\s*(.+)$/);
    if (name) {
      cur = { role, name: name[1]!.trim(), cik: "" };
      entities.push(cur);
      continue;
    }
    const cik = line.match(/CENTRAL INDEX KEY:\s*(\d+)/);
    if (cik && cur && !cur.cik) cur.cik = cik[1]!;
  }
  return { formType, entities };
}

const ofRole = (h: SecHeader, re: RegExp) => h.entities.find((e) => re.test(e.role));

/** subject = "SUBJECT COMPANY" (or ISSUER); filer = "FILED BY" (or FILER / REPORTING-OWNER). */
export function directionFromHeader(h: SecHeader): { filer?: HeaderEntity; subject?: HeaderEntity } {
  const subject = ofRole(h, /^(SUBJECT COMPANY|ISSUER)$/);
  const filer = ofRole(h, /^(FILED BY|FILER|REPORTING-OWNER)$/);
  return { filer, subject };
}
