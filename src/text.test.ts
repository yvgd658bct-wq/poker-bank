import { expect, it } from 'vitest';
import { addBuyIn, addPlayer, closeSession, createSession, setBank, setFinalStack } from './session';
import { whatsappText } from './text';
import type { Session } from './types';

it('WhatsApp-tekst voor de gemengde testavond', () => {
  let s: Session = ['A', 'B', 'C', 'D'].reduce((acc, n) => addPlayer(acc, n), createSession('2026-10-25', 3000));
  const id = (n: string) => s.players.find((p) => p.name === n)!.id;
  const T = '2026-10-25T20:00:00Z';
  for (const [n, m] of [['A', 'cash'], ['A', 'later'], ['A', 'later'], ['B', 'cash'], ['C', 'cash'], ['C', 'cash'], ['D', 'later']] as const) {
    s = addBuyIn(s, id(n), 3000, m, T);
  }
  for (const [n, v] of [['A', 2000], ['B', 10000], ['C', 5000], ['D', 4000]] as const) s = setFinalStack(s, id(n), v);
  s = setBank(s, id('C'));
  expect(whatsappText(closeSession(s, T))).toBe(
    [
      '🃏 Poker – zondag 25 oktober 2026',
      '',
      '*Resultaten*',
      'B: +€ 70,00',
      'D: +€ 10,00',
      'C: -€ 10,00',
      'A: -€ 70,00',
      '',
      '*Cash uit de pot*',
      'Bank (C) geeft € 100,00 aan B',
      'Bank (C) houdt € 20,00',
      '',
      '*Overschrijvingen*',
      'A → C: € 30,00',
      'A → D: € 10,00',
    ].join('\n'),
  );
});
