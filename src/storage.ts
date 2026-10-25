import type { AppData, Session } from './types';

const KEY = 'poker-bank.v1';
export const UNDO_LIMIT = 100;

export function emptyData(): AppData {
  return { version: 1, active: null, undo: [], history: [], knownNames: [] };
}

/** Leest alle data; bij een fout of corrupte data: lege toestand (en de fout wordt gemeld). */
export function load(storage: Storage | undefined = safeLocalStorage()): { data: AppData; error: string | null } {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { data: emptyData(), error: null };
    return { data: parseData(JSON.parse(raw)), error: null };
  } catch (e) {
    return { data: emptyData(), error: `Opgeslagen data kon niet gelezen worden: ${(e as Error).message}` };
  }
}

/** Schrijft alle data. Geeft een foutboodschap terug als het mislukt. */
export function save(data: AppData, storage: Storage | undefined = safeLocalStorage()): string | null {
  try {
    if (!storage) return 'Opslag is niet beschikbaar op dit toestel.';
    storage.setItem(KEY, JSON.stringify(data));
    return null;
  } catch (e) {
    return `Opslaan mislukt: ${(e as Error).message}`;
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function exportJson(data: AppData): string {
  return JSON.stringify({ app: 'poker-bank', exportedAt: new Date().toISOString(), data }, null, 2);
}

/** Leest een exportbestand. Gooit een fout met duidelijke boodschap als het bestand niet klopt. */
export function importJson(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dit is geen geldig JSON-bestand.');
  }
  const wrapper = parsed as { app?: unknown; data?: unknown };
  if (!wrapper || wrapper.app !== 'poker-bank') throw new Error('Dit is geen Poker Bank-exportbestand.');
  return parseData(wrapper.data);
}

// ---- validatie ----

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isMethod = (v: unknown) => v === 'cash' || v === 'later';

function fail(what: string): never {
  throw new Error(`Ongeldige data (${what}).`);
}

function checkSession(v: unknown, where: string): Session {
  if (!isObj(v)) fail(where);
  if (!isStr(v.id) || !isStr(v.date) || !isInt(v.defaultBuyIn)) fail(`${where}: basisvelden`);
  if (v.status !== 'active' && v.status !== 'closed') fail(`${where}: status`);
  if (!Array.isArray(v.players) || !Array.isArray(v.buyIns) || !Array.isArray(v.paid)) fail(`${where}: lijsten`);
  for (const p of v.players) {
    if (!isObj(p) || !isStr(p.id) || !isStr(p.name) || typeof p.isBank !== 'boolean' || typeof p.cashedOut !== 'boolean')
      fail(`${where}: speler`);
    if (p.finalStack !== null && !isInt(p.finalStack)) fail(`${where}: eindstack`);
    if (!isMethod(p.lastMethod)) fail(`${where}: betaalwijze speler`);
  }
  const ids = new Set(v.players.map((p) => (p as { id: string }).id));
  for (const b of v.buyIns) {
    if (!isObj(b) || !isStr(b.id) || !isStr(b.playerId) || !isInt(b.amount) || !isMethod(b.method) || !isStr(b.time))
      fail(`${where}: inkoop`);
    if (!ids.has(b.playerId)) fail(`${where}: inkoop van onbekende speler`);
  }
  if (v.status === 'closed' && !isObj(v.settlement)) fail(`${where}: afrekening`);
  if (v.status === 'closed' && (v.settlement as { transfers?: unknown[] }).transfers?.length !== v.paid.length)
    fail(`${where}: betaald-vinkjes`);
  return v as unknown as Session;
}

export function parseData(v: unknown): AppData {
  if (!isObj(v) || v.version !== 1) fail('versie');
  const active = v.active === null ? null : checkSession(v.active, 'actieve sessie');
  if (active && active.status !== 'active') fail('actieve sessie is afgesloten');
  if (!Array.isArray(v.history) || !Array.isArray(v.knownNames) || !Array.isArray(v.undo)) fail('lijsten');
  const history = v.history.map((s, i) => checkSession(s, `geschiedenis ${i + 1}`));
  if (history.some((s) => s.status !== 'closed')) fail('geschiedenis bevat open sessie');
  const undo = v.undo.map((u, i) => {
    if (!isObj(u) || !isStr(u.label)) fail(`undo ${i + 1}`);
    return { label: u.label, before: checkSession(u.before, `undo ${i + 1}`) };
  });
  const knownNames = v.knownNames.filter(isStr);
  return { version: 1, active, undo, history, knownNames };
}
