import { describe, expect, it } from 'vitest';
import { checkStacks, settle, SettlementError, type PayMethod, type PlayerInput, type Settlement } from './settle';

const E = (euro: number) => Math.round(euro * 100);

function player(name: string, finalStackEuro: number | null, buyIns: [PayMethod, number][]): PlayerInput {
  return {
    id: name,
    name,
    finalStack: finalStackEuro === null ? null : E(finalStackEuro),
    buyIns: buyIns.map(([method, euro]) => ({ method, amount: E(euro) })),
  };
}
const times = (n: number, method: PayMethod, euro = 30): [PayMethod, number][] => Array(n).fill([method, euro]);

const transfers = (s: Settlement) => s.transfers.map((t) => [t.fromName, t.toName, t.amount]);
const payouts = (s: Settlement) => s.cashPayouts.map((c) => [c.toName, c.amount]);
const resultOf = (s: Settlement) => Object.fromEntries(s.results.map((r) => [r.name, r.result]));

/** Eigenschap 8 + extra invarianten die voor elke afrekening moeten gelden. */
function expectInvariants(s: Settlement, players: PlayerInput[]) {
  for (const c of s.checks) {
    expect(c.cashPaid + c.transfersPaid - c.received).toBe(0 - c.result);
    expect(c.ok).toBe(true);
  }
  expect(s.cashPayouts.reduce((a, c) => a + c.amount, 0)).toBe(s.pot);
  for (const t of s.transfers) {
    expect(t.amount).toBeGreaterThan(0);
    expect(Number.isInteger(t.amount)).toBe(true);
    expect(t.fromId).not.toBe(t.toId);
  }
  for (const c of s.cashPayouts) expect(c.amount).toBeGreaterThan(0);
  // greedy: hoogstens (aantal spelers − 1) overschrijvingen
  expect(s.transfers.length).toBeLessThanOrEqual(Math.max(0, players.length - 1));
}

describe('afrekening', () => {
  it('1. alles later', () => {
    const players = [
      player('A', 20, times(3, 'later')),
      player('B', 100, times(1, 'later')),
      player('C', 50, times(2, 'later')),
      player('D', 40, times(1, 'later')),
    ];
    const s = settle(players);
    expect(resultOf(s)).toEqual({ A: E(-70), B: E(70), C: E(-10), D: E(10) });
    expect(s.pot).toBe(0);
    expect(payouts(s)).toEqual([]);
    expect(transfers(s)).toEqual([
      ['A', 'B', E(70)],
      ['C', 'D', E(10)],
    ]);
    expectInvariants(s, players);
  });

  it('2. gemengd', () => {
    const players = [
      player('A', 20, [['cash', 30], ...times(2, 'later')]),
      player('B', 100, times(1, 'cash')),
      player('C', 50, times(2, 'cash')),
      player('D', 40, times(1, 'later')),
    ];
    const s = settle(players);
    expect(s.pot).toBe(E(120));
    expect(Object.fromEntries(s.results.map((r) => [r.name, r.saldo]))).toEqual({ A: E(-40), B: E(100), C: E(50), D: E(10) });
    expect(payouts(s)).toEqual([
      ['B', E(100)],
      ['C', E(20)],
    ]);
    expect(transfers(s)).toEqual([
      ['A', 'C', E(30)],
      ['A', 'D', E(10)],
    ]);
    expect(resultOf(s)).toEqual({ A: E(-70), B: E(70), C: E(-10), D: E(10) });
    expectInvariants(s, players);
  });

  it('3. alles cash: enkel uitbetalingen uit de pot', () => {
    const players = [
      player('A', 20, times(3, 'cash')),
      player('B', 100, times(1, 'cash')),
      player('C', 50, times(2, 'cash')),
      player('D', 40, times(1, 'cash')),
    ];
    const s = settle(players);
    expect(s.pot).toBe(E(210));
    expect(transfers(s)).toEqual([]);
    expect(payouts(s)).toEqual([
      ['B', E(100)],
      ['C', E(50)],
      ['D', E(40)],
      ['A', E(20)],
    ]);
    expectInvariants(s, players);
  });

  it('4. eindtelling klopt niet: geblokkeerd met correct verschil', () => {
    const tooLittle = [player('A', 20, times(3, 'cash')), player('B', 60, times(1, 'later'))]; // 80 vs 120
    const c1 = checkStacks(tooLittle);
    expect(c1.ok).toBe(false);
    expect(c1.difference).toBe(E(-40));
    expect(() => settle(tooLittle)).toThrowError(SettlementError);
    try {
      settle(tooLittle);
    } catch (e) {
      expect((e as SettlementError).code).toBe('STACK_MISMATCH');
    }

    const tooMuch = [player('A', 100, times(3, 'cash')), player('B', 30.5, times(1, 'later'))];
    expect(checkStacks(tooMuch).difference).toBe(E(10.5));
    expect(() => settle(tooMuch)).toThrowError(SettlementError);

    const missing = [player('A', null, times(1, 'cash')), player('B', 30, times(1, 'cash'))];
    expect(checkStacks(missing).missingStacks).toEqual(['A']);
    expect(() => settle(missing)).toThrowError(/Eindstack ontbreekt/);
  });

  it('5. afwijkende inkoop (€15) en vroegtijdig uitcashen', () => {
    // E heeft vroeg uitgecasht met €15 na een halve inkoop; dat is gewoon een eindstack.
    const players = [
      player('A', 75, [['cash', 30], ['later', 15]]),
      player('B', 0, [['later', 30]]),
      player('E', 15, [['cash', 15]]),
    ];
    const s = settle(players);
    expect(resultOf(s)).toEqual({ A: E(30), B: E(-30), E: E(0) });
    expect(s.pot).toBe(E(45));
    // Saldi: A +60, B −30, E +15, pot −45. Pot gaat eerst naar de grootste (A).
    expect(payouts(s)).toEqual([['A', E(45)]]);
    expect(transfers(s)).toEqual([
      ['B', 'A', E(15)],
      ['B', 'E', E(15)],
    ]);
    expectInvariants(s, players);
  });

  it('6. iedereen break-even: geen betalingen', () => {
    const players = [player('A', 30, times(1, 'later')), player('B', 60, times(2, 'later')), player('C', 0, [])];
    const s = settle(players);
    expect(transfers(s)).toEqual([]);
    expect(payouts(s)).toEqual([]);
    expectInvariants(s, players);
  });

  it('6b. break-even met cash: enkel geld terug uit de pot', () => {
    const players = [player('A', 30, times(1, 'cash')), player('B', 30, times(1, 'later'))];
    const s = settle(players);
    expect(transfers(s)).toEqual([]);
    expect(payouts(s)).toEqual([['A', E(30)]]);
  });

  it('7. centen: geen afrondingsfouten', () => {
    const players = [
      player('A', 12.99, [['cash', 12.5], ['later', 0.1]]),
      player('B', 0.2, [['later', 0.1], ['cash', 0.2]]),
      player('C', 33.33, [['later', 33.33], ['cash', 0.01]]),
      player('D', 0.02, [['later', 0.3]]),
    ];
    const s = settle(players);
    expect(resultOf(s)).toEqual({ A: 39, B: -10, C: -1, D: -28 });
    expect(s.pot).toBe(1271);
    expect(payouts(s)).toEqual([['A', 1271]]);
    expect(transfers(s)).toEqual([
      ['D', 'A', 18],
      ['D', 'B', 10],
    ]);
    expectInvariants(s, players);
  });

  it('gooit een fout bij negatieve eindstack', () => {
    expect(() => settle([player('A', -10, []), player('B', 10, [])])).toThrowError(/Negatieve/);
  });
});

/** Deterministische PRNG zodat een falende run reproduceerbaar is. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('8. eigenschap op willekeurige sessies', () => {
  it('cash betaald + overschrijvingen betaald − ontvangen = −resultaat (2000 sessies)', () => {
    const rnd = mulberry32(20261025);
    const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
    for (let run = 0; run < 2000; run++) {
      const n = int(2, 9);
      const players: PlayerInput[] = [];
      let total = 0;
      for (let i = 0; i < n; i++) {
        const buyIns = Array.from({ length: int(0, 6) }, () => {
          const amount = rnd() < 0.7 ? 3000 : int(1, 10000); // meestal €30, soms een vreemd bedrag in centen
          total += amount;
          return { amount, method: (rnd() < 0.5 ? 'cash' : 'later') as PayMethod };
        });
        players.push({ id: `p${i}`, name: `Speler ${i}`, finalStack: 0, buyIns });
      }
      // Verdeel het totaal willekeurig over de eindstacks (som klopt exact).
      const cuts = Array.from({ length: n - 1 }, () => int(0, total)).sort((a, b) => a - b);
      const bounds = [0, ...cuts, total];
      players.forEach((p, i) => (p.finalStack = bounds[i + 1] - bounds[i]));

      const s = settle(players);
      expectInvariants(s, players);
      // Na afrekening staat iedereen netto op zijn resultaat.
      const sumResults = s.results.reduce((a, r) => a + r.result, 0);
      expect(sumResults).toBe(0);
    }
  });
});
