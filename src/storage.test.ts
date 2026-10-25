import { describe, expect, it } from 'vitest';
import { addBuyIn, addPlayer, closeSession, createSession, setFinalStack } from './session';
import { emptyData, exportJson, importJson, load, save } from './storage';
import type { AppData } from './types';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}
const throwing = { getItem() { throw new Error('geblokkeerd'); }, setItem() { throw new Error('vol'); } } as unknown as Storage;

function sample(): AppData {
  let s = addPlayer(addPlayer(createSession('2026-10-25', 3000), 'A'), 'B');
  s = addBuyIn(s, s.players[0].id, 3000, 'later', '2026-10-25T20:00:00Z');
  const active = s;
  s = setFinalStack(setFinalStack(s, s.players[0].id, 0), s.players[1].id, 3000);
  const closed = closeSession(s, '2026-10-25T23:00:00Z');
  return { version: 1, active, undo: [{ label: 'test', before: active }], history: [closed], knownNames: ['A', 'B'] };
}

describe('opslag', () => {
  it('bewaart en laadt (actieve sessie overleeft herladen)', () => {
    const st = memoryStorage();
    const data = sample();
    expect(save(data, st)).toBeNull();
    expect(load(st)).toEqual({ data, error: null });
  });

  it('lege opslag geeft lege data', () => {
    expect(load(memoryStorage())).toEqual({ data: emptyData(), error: null });
  });

  it('vangt fouten van localStorage op', () => {
    expect(load(throwing).error).toMatch(/geblokkeerd/);
    expect(save(emptyData(), throwing)).toMatch(/vol/);
    expect(save(emptyData(), undefined)).toMatch(/niet beschikbaar/);
  });

  it('corrupte data geeft een fout en lege toestand', () => {
    const st = memoryStorage();
    st.setItem('poker-bank.v1', '{"version":1,"active":{"id":1}}');
    const r = load(st);
    expect(r.error).toMatch(/Ongeldige data/);
    expect(r.data).toEqual(emptyData());
  });

  it('export → import geeft dezelfde data', () => {
    const data = sample();
    expect(importJson(exportJson(data))).toEqual(data);
  });

  it('import weigert vreemde bestanden', () => {
    expect(() => importJson('niet json')).toThrowError(/geen geldig JSON/);
    expect(() => importJson('{"foo":1}')).toThrowError(/geen Poker Bank/);
    const bad = JSON.parse(exportJson(sample()));
    bad.data.history[0].buyIns[0].amount = 12.5;
    expect(() => importJson(JSON.stringify(bad))).toThrowError(/inkoop/);
  });
});
