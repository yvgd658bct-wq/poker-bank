import { assertCents, type Cents } from './money';

export type PayMethod = 'cash' | 'later';

export interface BuyInInput {
  amount: Cents;
  method: PayMethod;
}

export interface PlayerInput {
  id: string;
  name: string;
  /** null = nog niet ingevuld */
  finalStack: Cents | null;
  buyIns: BuyInInput[];
}

export interface BuyInSummary {
  count: number;
  total: Cents;
  cash: Cents;
  later: Cents;
}

export interface PlayerResult extends BuyInSummary {
  id: string;
  name: string;
  finalStack: Cents;
  /** eindstack − totaal ingekocht */
  result: Cents;
  /** eindstack − inkopen later */
  saldo: Cents;
}

export interface CashPayout {
  toId: string;
  toName: string;
  amount: Cents;
}

export interface Transfer {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: Cents;
}

export interface PlayerCheck {
  id: string;
  name: string;
  cashPaid: Cents;
  transfersPaid: Cents;
  received: Cents;
  result: Cents;
  /** cashPaid + transfersPaid − received === −result */
  ok: boolean;
}

export interface Settlement {
  results: PlayerResult[];
  pot: Cents;
  cashPayouts: CashPayout[];
  transfers: Transfer[];
  checks: PlayerCheck[];
}

export interface StackCheck {
  totalBuyIns: Cents;
  totalStacks: Cents;
  /** totalStacks − totalBuyIns. Negatief = er ontbreekt, positief = te veel. */
  difference: Cents;
  missingStacks: string[];
  ok: boolean;
}

export type SettlementErrorCode = 'MISSING_STACK' | 'STACK_MISMATCH' | 'SUM_NOT_ZERO' | 'INVALID_AMOUNT';

export class SettlementError extends Error {
  constructor(
    public readonly code: SettlementErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SettlementError';
  }
}

export function summarizeBuyIns(buyIns: BuyInInput[]): BuyInSummary {
  let total = 0;
  let cash = 0;
  for (const b of buyIns) {
    assertCents(b.amount);
    total += b.amount;
    if (b.method === 'cash') cash += b.amount;
  }
  return { count: buyIns.length, total, cash, later: total - cash };
}

/** Controle 1: som eindstacks = som inkopen. */
export function checkStacks(players: PlayerInput[]): StackCheck {
  let totalBuyIns = 0;
  let totalStacks = 0;
  const missingStacks: string[] = [];
  for (const p of players) {
    totalBuyIns += summarizeBuyIns(p.buyIns).total;
    if (p.finalStack === null) missingStacks.push(p.name);
    else {
      assertCents(p.finalStack);
      totalStacks += p.finalStack;
    }
  }
  const difference = totalStacks - totalBuyIns;
  return { totalBuyIns, totalStacks, difference, missingStacks, ok: difference === 0 && missingStacks.length === 0 };
}

/** Totaal cash in de pot. */
export function potTotal(players: PlayerInput[]): Cents {
  return players.reduce((sum, p) => sum + summarizeBuyIns(p.buyIns).cash, 0);
}

interface Party {
  id: string;
  name: string;
  amount: Cents;
}

/** Grootste eerst; bij gelijke bedragen alfabetisch op naam, dan id (deterministisch). */
function byAmountDesc(a: Party, b: Party): number {
  return b.amount - a.amount || a.name.localeCompare(b.name, 'nl') || a.id.localeCompare(b.id);
}

export function settle(players: PlayerInput[]): Settlement {
  const stackCheck = checkStacks(players);
  if (stackCheck.missingStacks.length > 0) {
    throw new SettlementError('MISSING_STACK', `Eindstack ontbreekt voor: ${stackCheck.missingStacks.join(', ')}`);
  }
  if (stackCheck.difference !== 0) {
    throw new SettlementError('STACK_MISMATCH', `Eindstacks wijken af van de inkopen (${stackCheck.difference} cent)`);
  }
  for (const p of players) {
    if ((p.finalStack as number) < 0) throw new SettlementError('INVALID_AMOUNT', `Negatieve eindstack voor ${p.name}`);
    for (const b of p.buyIns) {
      if (b.amount <= 0) throw new SettlementError('INVALID_AMOUNT', `Ongeldige inkoop voor ${p.name}`);
    }
  }

  // 1. Saldo per speler
  const results: PlayerResult[] = players.map((p) => {
    const s = summarizeBuyIns(p.buyIns);
    const finalStack = p.finalStack as Cents;
    return { id: p.id, name: p.name, ...s, finalStack, result: finalStack - s.total, saldo: finalStack - s.later };
  });

  // 2. Pot als virtuele deelnemer; som saldi moet 0 zijn
  const pot = results.reduce((sum, r) => sum + r.cash, 0);
  const saldoSum = results.reduce((sum, r) => sum + r.saldo, 0) - pot;
  if (saldoSum !== 0) {
    throw new SettlementError('SUM_NOT_ZERO', `Som van de saldi is ${saldoSum} in plaats van 0`);
  }

  const creditors: Party[] = results.filter((r) => r.saldo > 0).map((r) => ({ id: r.id, name: r.name, amount: r.saldo }));
  const debtors: Party[] = results.filter((r) => r.saldo < 0).map((r) => ({ id: r.id, name: r.name, amount: -r.saldo }));

  // 3. Pot deelt eerst uit aan positieve saldi, grootste eerst
  const cashPayouts: CashPayout[] = [];
  let potLeft = pot;
  creditors.sort(byAmountDesc);
  for (const c of creditors) {
    if (potLeft === 0) break;
    const amount = Math.min(potLeft, c.amount);
    cashPayouts.push({ toId: c.id, toName: c.name, amount });
    c.amount -= amount;
    potLeft -= amount;
  }
  if (potLeft !== 0) throw new SettlementError('SUM_NOT_ZERO', 'Pot kon niet volledig uitgedeeld worden');

  // 4. Greedy: grootste schuldenaar betaalt aan grootste schuldeiser
  const transfers: Transfer[] = [];
  for (;;) {
    const openCreditors = creditors.filter((c) => c.amount > 0).sort(byAmountDesc);
    const openDebtors = debtors.filter((d) => d.amount > 0).sort(byAmountDesc);
    if (openCreditors.length === 0 && openDebtors.length === 0) break;
    if (openCreditors.length === 0 || openDebtors.length === 0) {
      throw new SettlementError('SUM_NOT_ZERO', 'Saldi gaan niet op');
    }
    const d = openDebtors[0];
    const c = openCreditors[0];
    const amount = Math.min(d.amount, c.amount);
    transfers.push({ fromId: d.id, fromName: d.name, toId: c.id, toName: c.name, amount });
    d.amount -= amount;
    c.amount -= amount;
  }

  // Controleregel per speler
  const checks: PlayerCheck[] = results.map((r) => {
    const transfersPaid = transfers.filter((t) => t.fromId === r.id).reduce((s, t) => s + t.amount, 0);
    const received =
      cashPayouts.filter((c) => c.toId === r.id).reduce((s, c) => s + c.amount, 0) +
      transfers.filter((t) => t.toId === r.id).reduce((s, t) => s + t.amount, 0);
    return {
      id: r.id,
      name: r.name,
      cashPaid: r.cash,
      transfersPaid,
      received,
      result: r.result,
      ok: r.cash + transfersPaid - received === -r.result,
    };
  });

  return { results, pot, cashPayouts, transfers, checks };
}
