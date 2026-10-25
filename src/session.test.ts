import { describe, expect, it } from 'vitest';
import * as S from './session';
import type { Session } from './types';

const T = '2026-10-25T20:00:00.000Z';

function withPlayers(...names: string[]): Session {
  return names.reduce((s, n) => S.addPlayer(s, n), S.createSession('2026-10-25', 3000));
}
const id = (s: Session, name: string) => s.players.find((p) => p.name === name)!.id;

describe('sessie', () => {
  it('weigert dubbele namen (ook met andere hoofdletters/spaties)', () => {
    const s = withPlayers('Jan');
    expect(() => S.addPlayer(s, '  jan ')).toThrowError(/speelt al mee/);
    expect(() => S.addPlayer(s, '   ')).toThrowError(/naam/);
  });

  it('speler met inkopen kan niet verwijderd worden, zonder inkopen wel', () => {
    let s = withPlayers('A', 'B');
    s = S.addBuyIn(s, id(s, 'A'), 3000, 'cash', T);
    expect(() => S.removePlayer(s, id(s, 'A'))).toThrowError(/uitcashen/);
    expect(S.removePlayer(s, id(s, 'B')).players.map((p) => p.name)).toEqual(['A']);
  });

  it('onthoudt de laatst gekozen betaalwijze per speler', () => {
    let s = withPlayers('A');
    s = S.addBuyIn(s, id(s, 'A'), 3000, 'later', T);
    expect(s.players[0].lastMethod).toBe('later');
  });

  it('uitgecashte speler kan niet inkopen tot hij terug aan tafel zit', () => {
    let s = withPlayers('A');
    s = S.addBuyIn(s, id(s, 'A'), 3000, 'cash', T);
    s = S.cashOut(s, id(s, 'A'), 4500);
    expect(() => S.addBuyIn(s, id(s, 'A'), 3000, 'cash', T)).toThrowError(/uitgecasht/);
    s = S.returnToTable(s, id(s, 'A'));
    expect(s.players[0].finalStack).toBeNull();
    expect(S.addBuyIn(s, id(s, 'A'), 3000, 'cash', T).buyIns).toHaveLength(2);
  });

  it('volledige gemengde testavond (test 2) via de sessie-acties', () => {
    let s = withPlayers('A', 'B', 'C', 'D');
    const buy = (n: string, m: 'cash' | 'later') => (s = S.addBuyIn(s, id(s, n), s.defaultBuyIn, m, T));
    buy('A', 'cash'); buy('A', 'later'); buy('A', 'later');
    buy('B', 'cash');
    buy('C', 'cash'); buy('C', 'cash');
    buy('D', 'later');
    // per ongeluk dubbel ingegeven en verwijderd
    buy('D', 'later');
    s = S.deleteBuyIn(s, s.buyIns[s.buyIns.length - 1].id);
    expect(S.sessionTotals(s)).toEqual({ onTable: 21000, pot: 12000 });
    expect(S.playerSummary(s, id(s, 'A'))).toEqual({ count: 3, total: 9000, cash: 3000, later: 6000 });

    s = S.setFinalStack(s, id(s, 'A'), 2000);
    s = S.setFinalStack(s, id(s, 'B'), 10000);
    s = S.setFinalStack(s, id(s, 'C'), 5000);
    expect(() => S.closeSession(s, T)).toThrowError(/Eindstack ontbreekt/);
    s = S.setFinalStack(s, id(s, 'D'), 4000);

    const closed = S.closeSession(s, T);
    const st = closed.settlement!;
    expect(st.cashPayouts.map((c) => [c.toName, c.amount])).toEqual([['B', 10000], ['C', 2000]]);
    expect(st.transfers.map((t) => [t.fromName, t.toName, t.amount])).toEqual([['A', 'C', 3000], ['A', 'D', 1000]]);
    expect(closed.paid).toEqual([false, false]);

    expect(S.canReopen(closed)).toBe(true);
    const paid = S.setPaid(closed, 0, true);
    expect(S.canReopen(paid)).toBe(false);
    expect(() => S.reopenSession(paid)).toThrowError(/Heropenen/);
    expect(S.reopenSession(closed).status).toBe('active');
  });

  it('afgesloten sessie kan niet meer gewijzigd worden', () => {
    let s = withPlayers('A');
    s = S.setFinalStack(s, id(s, 'A'), 0);
    const closed = S.closeSession(s, T);
    expect(() => S.addPlayer(closed, 'B')).toThrowError(/afgesloten/);
  });
});
