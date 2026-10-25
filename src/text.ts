/** Teksten die zowel in de interface als in de WhatsApp-export gebruikt worden. Puur. */
import { formatEuro, formatSigned } from './logic/money';
import type { CashPayout } from './logic/settle';
import type { PayMethod, Session } from './types';

/** Interfacetekst per betaalwijze. Intern heet `later` nog altijd `later` (compatibel met bewaarde data). */
export const METHOD_LABEL: Record<PayMethod, string> = { cash: 'Cash', later: 'Via overschrijving' };
/** Korte vorm in lopende tekst, bv. "cash € 30,00 · overschrijving € 60,00". */
export const METHOD_SHORT: Record<PayMethod, string> = { cash: 'cash', later: 'overschrijving' };

export function formatDateLong(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  return new Intl.DateTimeFormat('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function formatDateShort(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00');
  return new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short' }).format(d);
}

export function formatTime(isoTime: string): string {
  return new Intl.DateTimeFormat('nl-BE', { hour: '2-digit', minute: '2-digit' }).format(new Date(isoTime));
}

function bankName(s: Session): string | null {
  return s.players.find((p) => p.isBank)?.name ?? null;
}

/** "Bank geeft € 100,00 aan B" of "Bank houdt € 40,00" als de bank zelf de ontvanger is. */
export function payoutText(s: Session, c: CashPayout): string {
  const bank = s.players.find((p) => p.isBank);
  if (bank && bank.id === c.toId) return `Bank (${bank.name}) houdt ${formatEuro(c.amount)}`;
  const who = bankName(s);
  return `Bank${who ? ` (${who})` : ''} geeft ${formatEuro(c.amount)} aan ${c.toName}`;
}

export function whatsappText(s: Session): string {
  const st = s.settlement;
  if (!st) return '';
  const lines: string[] = [];
  lines.push(`🃏 Poker – ${formatDateLong(s.date)}`, '');
  lines.push('*Resultaten*');
  for (const r of [...st.results].sort((a, b) => b.result - a.result || a.name.localeCompare(b.name, 'nl'))) {
    lines.push(`${r.name}: ${formatSigned(r.result)}`);
  }
  lines.push('', '*Cash uit de pot*');
  if (st.cashPayouts.length === 0) lines.push('Geen');
  for (const c of st.cashPayouts) lines.push(payoutText(s, c));
  lines.push('', '*Overschrijvingen*');
  if (st.transfers.length === 0) lines.push('Geen');
  for (const t of st.transfers) lines.push(`${t.fromName} → ${t.toName}: ${formatEuro(t.amount)}`);
  return lines.join('\n');
}
