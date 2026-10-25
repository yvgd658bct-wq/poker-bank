import './style.css';
import { formatEuro, parseEuro } from './logic/money';
import * as S from './session';
import { exportJson, importJson, load, save, UNDO_LIMIT } from './storage';
import { METHOD_SHORT, whatsappText } from './text';
import type { AppData, PayMethod, Session } from './types';
import {
  esc,
  renderCloseLive,
  renderCloseTab,
  renderHistoryTab,
  renderSessionTab,
  renderSheet,
  type Sheet,
  type Tab,
  type UiState,
} from './ui/views';

const root = document.getElementById('app')!;
const loaded = load();
let data: AppData = loaded.data;
const ui: UiState = {
  tab: 'sessie',
  sheet: null,
  historyId: null,
  error: null,
  storageError: loaded.error,
};
let toastTimer: number | undefined;
/** Ingetypte naam die bewaard blijft als toevoegen mislukt (bv. dubbele naam). */
let draftName = '';

// ───────────────────────── toestand ─────────────────────────

function persist() {
  ui.storageError = save(data);
}

function setData(next: AppData) {
  data = next;
  persist();
}

function openSheet(sheet: Sheet | null) {
  ui.sheet = sheet;
  ui.error = null;
  render();
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Voert een actie op de actieve sessie uit en zet de vorige toestand op de undo-stapel. */
function mutate(label: string, fn: (s: Session) => Session, opts: { keepSheet?: boolean; toast?: string } = {}) {
  const before = data.active;
  if (!before) return;
  try {
    const after = fn(before);
    setData({ ...data, active: after, undo: [...data.undo, { label, before }].slice(-UNDO_LIMIT) });
    ui.error = null;
    if (!opts.keepSheet) ui.sheet = null;
    render();
    if (opts.toast) toast(opts.toast);
  } catch (e) {
    ui.error = message(e);
    render();
  }
}

function rememberName(name: string) {
  const rest = data.knownNames.filter((n) => n.toLocaleLowerCase('nl') !== name.toLocaleLowerCase('nl'));
  setData({ ...data, knownNames: [name, ...rest].slice(0, 50) });
}

function confirmSheet(title: string, body: string, confirmLabel: string, onConfirm: () => void, danger = false) {
  openSheet({ kind: 'confirm', title, body, confirmLabel, danger, onConfirm });
}

function toast(text: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

function inputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';
}

function amountFrom(id: string): number {
  const v = parseEuro(inputValue(id));
  if (v === null) throw new S.DomainError('Ongeldig bedrag. Gebruik bv. 30 of 12,50.');
  return v;
}

function updateHistorySession(id: string, fn: (s: Session) => Session) {
  try {
    setData({ ...data, history: data.history.map((s) => (s.id === id ? fn(s) : s)) });
  } catch (e) {
    toast(message(e));
  }
  render();
}

// ───────────────────────── render ─────────────────────────

function render() {
  const tabs: [Tab, string][] = [
    ['sessie', 'Sessie'],
    ['afsluiten', 'Afsluiten'],
    ['geschiedenis', 'Geschiedenis'],
  ];
  let content = '';
  if (ui.tab === 'sessie') content = renderSessionTab(data);
  else if (ui.tab === 'afsluiten') content = renderCloseTab(data);
  else content = renderHistoryTab(data, ui);

  const scrollY = window.scrollY;
  root.innerHTML = `
    ${ui.storageError ? `<div class="storage-error">${esc(ui.storageError)}</div>` : ''}
    <main class="screen">${content}</main>
    <nav class="tabbar">${tabs
      .map(([t, label]) => `<button class="${ui.tab === t ? 'active' : ''}" data-action="tab" data-tab="${t}">${label}</button>`)
      .join('')}</nav>
    ${ui.sheet ? renderSheet(data, ui.sheet, ui.error, draftName) : ''}
    <div id="toast" class="toast" role="status"></div>`;
  window.scrollTo(0, scrollY);
  const auto = root.querySelector<HTMLInputElement>('.sheet [autofocus]');
  if (auto) {
    auto.focus();
    auto.select();
  }
}

// ───────────────────────── acties ─────────────────────────

const actions: Record<string, (el: HTMLElement) => void> = {
  tab(el) {
    ui.tab = el.dataset.tab as Tab;
    ui.historyId = null;
    ui.sheet = null;
    render();
    window.scrollTo(0, 0);
  },
  'close-sheet'() {
    openSheet(null);
  },
  'goto-history'() {
    ui.tab = 'geschiedenis';
    render();
  },

  // Sessie
  'start-session'() {
    const amount = parseEuro(inputValue('new-buyin'));
    if (amount === null || amount === 0) return toast('Ongeldig inkoopbedrag.');
    try {
      setData({ ...data, active: S.createSession(inputValue('new-date'), amount), undo: [] });
      openSheet({ kind: 'addPlayer' });
    } catch (e) {
      toast(message(e));
    }
  },
  undo() {
    const last = data.undo[data.undo.length - 1];
    if (!last) return;
    setData({ ...data, active: last.before, undo: data.undo.slice(0, -1) });
    ui.sheet = null;
    render();
    toast(`Ongedaan: ${last.label}`);
  },
  'open-default-buyin'() {
    openSheet({ kind: 'defaultBuyIn' });
  },
  'save-default-buyin'() {
    try {
      const amount = amountFrom('default-amount');
      mutate(`Standaard inkoop → ${formatEuro(amount)}`, (s) => S.setDefaultBuyIn(s, amount));
    } catch (e) {
      ui.error = message(e);
      render();
    }
  },
  'open-add-player'() {
    openSheet({ kind: 'addPlayer' });
  },
  'add-known'(el) {
    addPlayer(el.dataset.name ?? '');
  },
  'open-buyin'(el) {
    openSheet({ kind: 'buyin', playerId: el.dataset.id! });
  },
  buyin(el) {
    const sheet = ui.sheet;
    const s = data.active;
    if (sheet?.kind !== 'buyin' || !s) return;
    const method = el.dataset.method as PayMethod;
    let amount: number;
    try {
      amount = amountFrom('buyin-amount');
      if (amount === 0) throw new S.DomainError('Het bedrag moet groter zijn dan € 0,00.');
    } catch (e) {
      // Ingetypte tekst behouden zodat de bank ze kan verbeteren.
      ui.sheet = { ...sheet, amountText: inputValue('buyin-amount') };
      ui.error = message(e);
      return render();
    }
    const name = s.players.find((p) => p.id === sheet.playerId)?.name ?? '';
    const label = `Inkoop ${name} ${formatEuro(amount)} ${METHOD_SHORT[method]}`;
    mutate(label, (x) => S.addBuyIn(x, sheet.playerId, amount, method, new Date().toISOString()), { toast: `✓ ${label}` });
  },
  'ask-delete-buyin'(el) {
    const s = data.active;
    const b = s?.buyIns.find((x) => x.id === el.dataset.id);
    if (!s || !b) return;
    const text = S.describeBuyIn(s, b);
    confirmSheet('Inkoop verwijderen?', `${esc(text)} om ${new Date(b.time).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })}`, 'Verwijderen', () =>
      mutate(`Verwijderd: ${text}`, (x) => S.deleteBuyIn(x, b.id)),
    true);
  },
  'ask-switch-method'(el) {
    const s = data.active;
    const b = s?.buyIns.find((x) => x.id === el.dataset.id);
    if (!s || !b) return;
    const to: PayMethod = b.method === 'cash' ? 'later' : 'cash';
    const text = S.describeBuyIn(s, b);
    confirmSheet('Betaalwijze wijzigen?', `${esc(text)} → <b>${METHOD_SHORT[to]}</b>`, `Wijzig naar ${METHOD_SHORT[to]}`, () =>
      mutate(`${text} → ${METHOD_SHORT[to]}`, (x) => S.setBuyInMethod(x, b.id, to)),
    );
  },
  'open-player-menu'(el) {
    openSheet({ kind: 'playerMenu', playerId: el.dataset.id! });
  },
  'open-cashout'(el) {
    openSheet({ kind: 'cashout', playerId: el.dataset.id! });
  },
  cashout(el) {
    const id = el.dataset.id!;
    const name = data.active?.players.find((p) => p.id === id)?.name ?? '';
    try {
      const amount = amountFrom('cashout-amount');
      mutate(`${name} uitgecasht (${formatEuro(amount)})`, (s) => S.cashOut(s, id, amount), { toast: `${name} uitgecasht` });
    } catch (e) {
      ui.error = message(e);
      render();
    }
  },
  'return-to-table'(el) {
    const id = el.dataset.id!;
    const name = data.active?.players.find((p) => p.id === id)?.name ?? '';
    mutate(`${name} terug aan tafel`, (s) => S.returnToTable(s, id));
  },
  'toggle-bank'(el) {
    const id = el.dataset.id!;
    const p = data.active?.players.find((x) => x.id === id);
    if (!p) return;
    mutate(p.isBank ? `${p.name} is niet meer bank` : `${p.name} is bank`, (s) => S.setBank(s, p.isBank ? null : id));
  },
  'ask-remove-player'(el) {
    const id = el.dataset.id!;
    const name = data.active?.players.find((p) => p.id === id)?.name ?? '';
    confirmSheet('Speler verwijderen?', `${esc(name)} wordt uit deze sessie verwijderd.`, 'Verwijderen', () =>
      mutate(`${name} verwijderd`, (s) => S.removePlayer(s, id)),
    true);
  },
  confirm() {
    if (ui.sheet?.kind === 'confirm') ui.sheet.onConfirm();
  },

  // Afsluiten
  'pot-checked'(el) {
    const checked = (el as HTMLInputElement).checked;
    if (!data.active) return;
    setData({ ...data, active: S.setPotChecked(data.active, checked) });
  },
  'ask-close'() {
    const s = data.active;
    if (!s) return;
    const warn = s.potChecked ? '' : '<br><br><b>Let op:</b> "Cash in de pot klopt" is niet aangevinkt.';
    confirmSheet('Sessie afsluiten?', `De afrekening wordt vastgelegd en de sessie gaat naar Geschiedenis.${warn}`, 'Afsluiten', () => {
      try {
        const closed = S.closeSession(s, new Date().toISOString());
        setData({ ...data, active: null, undo: [], history: [closed, ...data.history] });
        ui.sheet = null;
        ui.tab = 'geschiedenis';
        ui.historyId = closed.id;
        render();
        window.scrollTo(0, 0);
      } catch (e) {
        ui.error = message(e);
        render();
      }
    });
  },

  // Geschiedenis
  'open-history'(el) {
    ui.historyId = el.dataset.id!;
    render();
    window.scrollTo(0, 0);
  },
  'close-history'() {
    ui.historyId = null;
    render();
  },
  'toggle-paid'(el) {
    const input = el as HTMLInputElement;
    updateHistorySession(input.dataset.session!, (s) => S.setPaid(s, Number(input.dataset.index), input.checked));
  },
  'copy-whatsapp'(el) {
    const s = data.history.find((x) => x.id === el.dataset.id);
    if (s) void copyText(whatsappText(s));
  },
  'ask-reopen'(el) {
    const s = data.history.find((x) => x.id === el.dataset.id);
    if (!s || data.active) return;
    confirmSheet('Sessie heropenen?', 'De afrekening wordt geschrapt en de sessie wordt weer actief, zodat je eindstacks of inkopen kunt corrigeren.', 'Heropenen', () => {
      try {
        const active = S.reopenSession(s);
        setData({ ...data, active, undo: [], history: data.history.filter((x) => x.id !== s.id) });
        ui.sheet = null;
        ui.historyId = null;
        ui.tab = 'afsluiten';
        render();
      } catch (e) {
        ui.error = message(e);
        render();
      }
    });
  },
  export() {
    void exportData();
  },
};

function addPlayer(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  draftName = name;
  mutate(`Speler ${clean} toegevoegd`, (s) => S.addPlayer(s, clean), { keepSheet: true, toast: `${clean} toegevoegd` });
  if (!ui.error) {
    draftName = '';
    rememberName(clean);
  }
  render();
  draftName = '';
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Gekopieerd — plak in WhatsApp');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? 'Gekopieerd — plak in WhatsApp' : 'Kopiëren mislukt');
  }
}

async function exportData() {
  const json = exportJson(data);
  const name = `poker-bank-backup-${S.todayIso()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Poker Bank backup' });
      return;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importFile(input: HTMLInputElement) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const imported = importJson(await file.text());
    confirmSheet(
      'Backup importeren?',
      `Alle huidige data op dit toestel wordt vervangen door de backup (${imported.history.length} afgesloten sessies${imported.active ? ' + 1 actieve sessie' : ''}).`,
      'Vervangen',
      () => {
        setData(imported);
        ui.sheet = null;
        ui.historyId = null;
        render();
        toast('Backup geïmporteerd');
      },
      true,
    );
  } catch (e) {
    toast(message(e));
  }
}

// ───────────────────────── events ─────────────────────────

root.addEventListener('click', (ev) => {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el || el.tagName === 'INPUT') return; // checkboxes/bestanden via 'change'
  const action = actions[el.dataset.action!];
  if (action) {
    ev.preventDefault();
    action(el);
  }
});

root.addEventListener('change', (ev) => {
  const el = ev.target as HTMLInputElement;
  if (el.dataset.action === 'import') return void importFile(el);
  if (el.dataset.action && el.tagName === 'INPUT') actions[el.dataset.action]?.(el);
});

root.addEventListener('submit', (ev) => {
  const form = ev.target as HTMLFormElement;
  if (form.dataset.form === 'add-player') {
    ev.preventDefault();
    addPlayer(inputValue('player-name'));
  }
});

// Eindstacks: live herberekenen zonder het invoerveld te hertekenen (focus blijft).
root.addEventListener('input', (ev) => {
  const el = ev.target as HTMLInputElement;
  const playerId = el.dataset.stack;
  if (!playerId || !data.active) return;
  const raw = el.value.trim();
  const value = raw === '' ? null : parseEuro(raw);
  el.classList.toggle('invalid', raw !== '' && value === null);
  setData({ ...data, active: S.setFinalStack(data.active, playerId, value) });
  const live = document.getElementById('close-live');
  if (live) live.innerHTML = renderCloseLive(data.active!);
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && ui.sheet) openSheet(null);
});

render();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* offline-ondersteuning niet beschikbaar; app werkt verder online */
    });
  });
}
