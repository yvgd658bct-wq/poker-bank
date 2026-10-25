/** Bedragen altijd in centen (integers). */
export type Cents = number;

const formatter = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' });

/** Formatteert centen als `€ 30,00` (Belgisch formaat, gewone spaties). */
export function formatEuro(cents: Cents): string {
  assertCents(cents);
  return formatter.format(cents / 100).replace(/ | /g, ' ');
}

/** Zoals formatEuro, maar met expliciet + voor positieve bedragen. */
export function formatSigned(cents: Cents): string {
  if (cents > 0) return '+' + formatEuro(cents);
  return formatEuro(cents);
}

/**
 * Leest een door de gebruiker ingetypt bedrag zonder floats.
 * Aanvaardt "30", "12,5", "12,50", "12.50", "€ 12,50". Geeft null bij ongeldige invoer.
 */
export function parseEuro(input: string): Cents | null {
  const s = input.replace(/€/g, '').replace(/\s/g, '');
  const m = /^(\d{1,7})(?:[.,](\d{0,2}))?$/.exec(s);
  if (!m) return null;
  const euros = parseInt(m[1], 10);
  const frac = (m[2] ?? '').padEnd(2, '0');
  return euros * 100 + parseInt(frac, 10);
}

/** Centen → invoertekst ("12,50" of "30"). */
export function centsToInput(cents: Cents): string {
  assertCents(cents);
  const e = Math.floor(cents / 100);
  const c = cents % 100;
  return c === 0 ? String(e) : `${e},${String(c).padStart(2, '0')}`;
}

export function assertCents(value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`Ongeldig bedrag in centen: ${value}`);
}
