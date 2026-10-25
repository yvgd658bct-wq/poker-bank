/**
 * Toestandsovergangen van een sessie. Puur: elke functie geeft een nieuwe Session terug
 * en gooit een DomainError (met Nederlandse boodschap) bij ongeldige acties.
 */
import { formatEuro } from './logic/money';
import { settle, summarizeBuyIns, type BuyInSummary, type PlayerInput } from './logic/settle';
import type { BuyIn, Cents, PayMethod, Player, Session } from './types';

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

let counter = 0;
export function newId(): string {
  counter = (counter + 1) % 1e6;
  return Date.now().toString(36) + '-' + counter.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

export function todayIso(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const normName = (name: string) => name.trim().replace(/\s+/g, ' ');
const sameName = (a: string, b: string) => normName(a).toLocaleLowerCase('nl') === normName(b).toLocaleLowerCase('nl');

function assertActive(s: Session) {
  if (s.status !== 'active') throw new DomainError('Deze sessie is afgesloten.');
}

function findPlayer(s: Session, playerId: string): Player {
  const p = s.players.find((x) => x.id === playerId);
  if (!p) throw new DomainError('Speler niet gevonden.');
  return p;
}

function assertAmount(amount: Cents, allowZero: boolean) {
  if (!Number.isSafeInteger(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw new DomainError('Ongeldig bedrag.');
  }
}

const updatePlayer = (s: Session, id: string, patch: Partial<Player>): Session => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

export function createSession(date: string, defaultBuyIn: Cents): Session {
  assertAmount(defaultBuyIn, false);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DomainError('Ongeldige datum.');
  return {
    id: newId(),
    date,
    defaultBuyIn,
    players: [],
    buyIns: [],
    status: 'active',
    potChecked: false,
    closedAt: null,
    settlement: null,
    paid: [],
  };
}

export function setDefaultBuyIn(s: Session, amount: Cents): Session {
  assertActive(s);
  assertAmount(amount, false);
  return { ...s, defaultBuyIn: amount };
}

export function addPlayer(s: Session, rawName: string): Session {
  assertActive(s);
  const name = normName(rawName);
  if (!name) throw new DomainError('Geef een naam in.');
  if (s.players.some((p) => sameName(p.name, name))) throw new DomainError(`${name} speelt al mee.`);
  const player: Player = { id: newId(), name, isBank: false, cashedOut: false, finalStack: null, lastMethod: 'cash' };
  return { ...s, players: [...s.players, player] };
}

export function removePlayer(s: Session, playerId: string): Session {
  assertActive(s);
  const p = findPlayer(s, playerId);
  if (s.buyIns.some((b) => b.playerId === playerId)) {
    throw new DomainError(`${p.name} heeft inkopen en kan niet verwijderd worden. Gebruik uitcashen.`);
  }
  return { ...s, players: s.players.filter((x) => x.id !== playerId) };
}

/** Duidt één speler aan als bank (of niemand, met null). */
export function setBank(s: Session, playerId: string | null): Session {
  assertActive(s);
  if (playerId) findPlayer(s, playerId);
  return { ...s, players: s.players.map((p) => ({ ...p, isBank: p.id === playerId })) };
}

export function addBuyIn(s: Session, playerId: string, amount: Cents, method: PayMethod, time: string): Session {
  assertActive(s);
  assertAmount(amount, false);
  const p = findPlayer(s, playerId);
  if (p.cashedOut) throw new DomainError(`${p.name} is uitgecasht. Zet hem eerst terug aan tafel.`);
  const buyIn: BuyIn = { id: newId(), playerId, amount, method, time };
  return { ...updatePlayer(s, playerId, { lastMethod: method }), buyIns: [...s.buyIns, buyIn], potChecked: false };
}

export function deleteBuyIn(s: Session, buyInId: string): Session {
  assertActive(s);
  if (!s.buyIns.some((b) => b.id === buyInId)) throw new DomainError('Inkoop niet gevonden.');
  return { ...s, buyIns: s.buyIns.filter((b) => b.id !== buyInId), potChecked: false };
}

export function setBuyInMethod(s: Session, buyInId: string, method: PayMethod): Session {
  assertActive(s);
  if (!s.buyIns.some((b) => b.id === buyInId)) throw new DomainError('Inkoop niet gevonden.');
  return { ...s, buyIns: s.buyIns.map((b) => (b.id === buyInId ? { ...b, method } : b)), potChecked: false };
}

export function cashOut(s: Session, playerId: string, finalStack: Cents): Session {
  assertActive(s);
  assertAmount(finalStack, true);
  const p = findPlayer(s, playerId);
  if (p.cashedOut) throw new DomainError(`${p.name} is al uitgecasht.`);
  return updatePlayer(s, playerId, { cashedOut: true, finalStack });
}

export function returnToTable(s: Session, playerId: string): Session {
  assertActive(s);
  findPlayer(s, playerId);
  return updatePlayer(s, playerId, { cashedOut: false, finalStack: null });
}

export function setFinalStack(s: Session, playerId: string, finalStack: Cents | null): Session {
  assertActive(s);
  if (finalStack !== null) assertAmount(finalStack, true);
  findPlayer(s, playerId);
  return updatePlayer(s, playerId, { finalStack });
}

export function setPotChecked(s: Session, checked: boolean): Session {
  assertActive(s);
  return { ...s, potChecked: checked };
}

export function toPlayerInputs(s: Session): PlayerInput[] {
  return s.players.map((p) => ({
    id: p.id,
    name: p.name,
    finalStack: p.finalStack,
    buyIns: s.buyIns.filter((b) => b.playerId === p.id).map((b) => ({ amount: b.amount, method: b.method })),
  }));
}

export function playerSummary(s: Session, playerId: string): BuyInSummary {
  return summarizeBuyIns(s.buyIns.filter((b) => b.playerId === playerId));
}

export function sessionTotals(s: Session): { onTable: Cents; pot: Cents } {
  const sum = summarizeBuyIns(s.buyIns);
  return { onTable: sum.total, pot: sum.cash };
}

/** Sluit af; gooit een fout (via settle) als de eindtelling niet klopt. */
export function closeSession(s: Session, closedAt: string): Session {
  assertActive(s);
  if (s.players.length === 0) throw new DomainError('Geen spelers in deze sessie.');
  const settlement = settle(toPlayerInputs(s));
  return { ...s, status: 'closed', closedAt, settlement, paid: settlement.transfers.map(() => false) };
}

export function canReopen(s: Session): boolean {
  return s.status === 'closed' && !s.paid.some(Boolean);
}

export function reopenSession(s: Session): Session {
  if (!canReopen(s)) throw new DomainError('Heropenen kan niet meer: er is al een overschrijving afgevinkt.');
  return { ...s, status: 'active', closedAt: null, settlement: null, paid: [] };
}

export function setPaid(s: Session, index: number, paid: boolean): Session {
  if (s.status !== 'closed' || !s.settlement || index < 0 || index >= s.settlement.transfers.length) {
    throw new DomainError('Overschrijving niet gevonden.');
  }
  return { ...s, paid: s.paid.map((v, i) => (i === index ? paid : v)) };
}

export function describeBuyIn(s: Session, b: BuyIn): string {
  const p = s.players.find((x) => x.id === b.playerId);
  return `${p?.name ?? '?'} ${formatEuro(b.amount)} ${b.method === 'cash' ? 'cash' : 'later'}`;
}
