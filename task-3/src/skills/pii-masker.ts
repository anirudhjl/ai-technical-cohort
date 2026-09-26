// Reusable masking logic used before anything is written to a log or the
// append-only audit ledger, per CLAUDE.md ("Mask sensitive data in logs").
// The primary case JSON store is NOT masked here — that is the system of
// record the Data Steward needs to review in full; masking applies only to
// the observability/audit log stream.
export function maskName(name: string | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => `${p.charAt(0).toUpperCase()}.`).join(" ");
}

export function maskNpi(npi: string | undefined): string {
  if (!npi) return "";
  if (npi.length <= 4) return "*".repeat(npi.length);
  return `${npi.slice(0, 2)}${"*".repeat(npi.length - 4)}${npi.slice(-2)}`;
}

export function maskAddressLine(line: string | undefined): string {
  if (!line) return "";
  return line.replace(/\d+/g, "#");
}

export function maskPostalCode(postalCode: string | undefined): string {
  if (!postalCode) return "";
  return `${postalCode.slice(0, 2)}${"*".repeat(Math.max(postalCode.length - 2, 0))}`;
}

export function maskCity(city: string | undefined): string {
  if (!city) return "";
  return `${city.charAt(0).toUpperCase()}.`;
}

export interface MaskablePayload {
  name?: string;
  npi?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

function maskOne(text: string, payload: MaskablePayload): string {
  let masked = text;
  if (payload.name) masked = masked.split(payload.name).join(maskName(payload.name));
  if (payload.npi) masked = masked.split(payload.npi).join(maskNpi(payload.npi));
  if (payload.line1) masked = masked.split(payload.line1).join(maskAddressLine(payload.line1));
  if (payload.line2) masked = masked.split(payload.line2).join(maskAddressLine(payload.line2));
  if (payload.city) masked = masked.split(payload.city).join(maskCity(payload.city));
  // State is masked last: a 2-letter code (e.g. "FL") is a substring risk for
  // other already-masked tokens, so it must not run before them.
  if (payload.state) masked = masked.split(payload.state).join("**");
  if (payload.postalCode) masked = masked.split(payload.postalCode).join(maskPostalCode(payload.postalCode));
  return masked;
}

// Evidence text can quote two distinct addresses in one sentence (e.g.
// "on file X vs incoming Y" in reconciliation output), so callers may pass
// one payload per address rather than being limited to a single value per field.
export function maskFreeText(text: string, payload: MaskablePayload | MaskablePayload[]): string {
  const payloads = Array.isArray(payload) ? payload : [payload];
  return payloads.reduce((acc, p) => maskOne(acc, p), text);
}
