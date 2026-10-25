/**
 * Render-functies: toestand → HTML-string. Geen side effects.
 * Interactie gebeurt via data-action attributen (zie main.ts).
 */
import { centsToInput, formatEuro, formatSigned } from '../logic/money';
import { checkStacks, settle, type Settlement } from '../logic/settle';
import { canReopen, playerSummary, sessionTotals, toPlayerInputs } from '../session';
import { formatDateLong, formatDateShort, formatTime, METHOD_LABEL, METHOD_SHORT, payoutText } from '../text';
import type { AppData, Player, Session } from '../types';

export type Tab = 'sessie' | 'afsluiten' | 'geschiedenis';

export type Sheet =
  | { kind: 'buyin'; playerId: string; amountText?: string }
  | { kind: 'addPlayer' }
  | { kind: 'playerMenu'; playerId: string }
  | { kind: 'cashout'; playerId: string }
  | { kind: 'defaultBuyIn' }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger: boolean; onConfirm: () => void };

export interface UiState {
  tab: Tab;
  sheet: Sheet | null;
  historyId: string | null;
  error: string | null;
  storageError: string | null;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const methodBadge = (m: 'cash' | 'later') => `<span class="badge ${m}">${m === 'cash' ? 'Cash' : 'Overschr.'}</span>`;
const signClass = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

// ───────────────────────── Sessie ─────────────────────────

export function renderSessionTab(data: AppData): string {
  const s = data.active;
  if (!s) return renderNewSession(data);
  const { onTable, pot } = sessionTotals(s);
  const lastUndo = data.undo[data.undo.length - 1];
  const players = s.players
    .map((p) => renderPlayerCard(s, p))
    .join('');
  return `
    <div class="sticky-top">
      <div class="totals">
        <div><div class="label">Op tafel</div><div class="big">${formatEuro(onTable)}</div></div>
        <div><div class="label">Cash in de pot</div><div class="big cash-text">${formatEuro(pot)}</div></div>
      </div>
      <button class="btn undo" data-action="undo" ${lastUndo ? '' : 'disabled'}>
        ↶ Ongedaan maken${lastUndo ? `<span class="undo-label">${esc(lastUndo.label)}</span>` : ''}
      </button>
    </div>
    <div class="session-meta">
      <span class="cap">${esc(formatDateLong(s.date))}</span>
      <button class="link" data-action="open-default-buyin">Standaard inkoop ${formatEuro(s.defaultBuyIn)} ✎</button>
    </div>
    ${s.players.length === 0 ? '<p class="empty">Nog geen spelers. Voeg ze toe om te beginnen.</p>' : ''}
    <div class="players">${players}</div>
    <button class="btn secondary wide" data-action="open-add-player">+ Speler toevoegen</button>
    ${renderLog(s)}
  `;
}

function renderPlayerCard(s: Session, p: Player): string {
  const sum = playerSummary(s, p.id);
  const detail =
    sum.count === 0
      ? 'Nog geen inkopen'
      : `${sum.count}× · ${formatEuro(sum.total)} <span class="muted">(cash <span class="nw">${formatEuro(sum.cash)}</span> · ${METHOD_SHORT.later} <span class="nw">${formatEuro(sum.later)}</span>)</span>`;
  return `
    <div class="card player ${p.cashedOut ? 'inactive' : ''}">
      <div class="player-head">
        <div class="player-name">${esc(p.name)}${p.isBank ? ' <span class="badge bank">Bank</span>' : ''}</div>
        <button class="icon-btn" data-action="open-player-menu" data-id="${p.id}" aria-label="Opties voor ${esc(p.name)}">⋯</button>
      </div>
      <div class="player-sum">${detail}</div>
      ${
        p.cashedOut
          ? `<div class="cashed">Uitgecasht met ${formatEuro(p.finalStack ?? 0)}</div>`
          : `<button class="btn primary buyin" data-action="open-buyin" data-id="${p.id}">+ Inkoop</button>`
      }
    </div>`;
}

function renderLog(s: Session): string {
  const rows = [...s.buyIns]
    .map((b, i) => ({ b, nr: i + 1 }))
    .reverse()
    .map(({ b, nr }) => {
      const p = s.players.find((x) => x.id === b.playerId);
      const other: 'cash' | 'later' = b.method === 'cash' ? 'later' : 'cash';
      return `
        <li class="log-row">
          <span class="log-nr">#${nr}</span>
          <span class="log-time">${formatTime(b.time)}</span>
          <span class="log-name">${esc(p?.name ?? '?')}</span>
          <span class="log-amount">${formatEuro(b.amount)}</span>
          ${methodBadge(b.method)}
          <span class="log-actions">
            <button class="icon-btn small" data-action="ask-switch-method" data-id="${b.id}" aria-label="Wijzig naar ${METHOD_SHORT[other]}">⇄</button>
            <button class="icon-btn small danger" data-action="ask-delete-buyin" data-id="${b.id}" aria-label="Verwijder">✕</button>
          </span>
        </li>`;
    })
    .join('');
  return `
    <section class="log">
      <h2>Logboek <span class="muted">(${s.buyIns.length} inkopen)</span></h2>
      ${s.buyIns.length === 0 ? '<p class="empty">Nog geen inkopen.</p>' : `<ul>${rows}</ul>`}
    </section>`;
}

function renderNewSession(data: AppData): string {
  const today = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const iso = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`;
  return `
    ${renderOpenTransfersNotice(data)}
    <div class="card">
      <h2>Nieuwe sessie</h2>
      <label class="field">Datum<input type="date" id="new-date" value="${iso}"></label>
      <label class="field">Standaard inkoop (€)<input id="new-buyin" inputmode="decimal" value="30"></label>
      <button class="btn primary wide" data-action="start-session">Start sessie</button>
    </div>`;
}

function renderOpenTransfersNotice(data: AppData): string {
  const n = openTransfers(data).length;
  if (n === 0) return '';
  return `<button class="notice" data-action="goto-history">${n} openstaande overschrijving${n === 1 ? '' : 'en'} — bekijk in Geschiedenis</button>`;
}

// ───────────────────────── Afsluiten ─────────────────────────

export function renderCloseTab(data: AppData): string {
  const s = data.active;
  if (!s) return '<p class="empty">Er is geen actieve sessie.</p>';
  if (s.players.length === 0) return '<p class="empty">Voeg eerst spelers toe.</p>';
  const rows = s.players
    .map((p) => {
      const sum = playerSummary(s, p.id);
      return `
      <div class="stack-row">
        <div>
          <div class="player-name">${esc(p.name)}${p.cashedOut ? ' <span class="badge">uitgecasht</span>' : ''}</div>
          <div class="muted small">ingekocht ${formatEuro(sum.total)}</div>
        </div>
        <label class="stack-input">€<input inputmode="decimal" data-stack="${p.id}" placeholder="eindstack"
          value="${p.finalStack === null ? '' : centsToInput(p.finalStack)}"></label>
      </div>`;
    })
    .join('');
  return `
    <div class="card">
      <h2>Eindstacks</h2>
      <p class="muted small">Vul de waarde van de fiches in voor elke speler.</p>
      ${rows}
    </div>
    <div id="close-live">${renderCloseLive(s)}</div>`;
}

/** Deel van het afsluitscherm dat live herberekend wordt tijdens het typen. */
export function renderCloseLive(s: Session): string {
  const check = checkStacks(toPlayerInputs(s));
  const { pot } = sessionTotals(s);
  let status: string;
  if (check.missingStacks.length > 0) {
    status = `<div class="check warn">Nog in te vullen: ${esc(check.missingStacks.join(', '))}</div>`;
  } else if (check.difference < 0) {
    status = `<div class="check bad">Er ontbreekt ${formatEuro(-check.difference)}</div>`;
  } else if (check.difference > 0) {
    status = `<div class="check bad">Er is ${formatEuro(check.difference)} te veel</div>`;
  } else {
    status = `<div class="check good">Eindtelling klopt: verschil € 0,00 ✓</div>`;
  }

  let preview = '';
  if (check.ok) {
    try {
      const st = settle(toPlayerInputs(s));
      preview = `
        <h2 class="section-title">Voorbeeld afrekening</h2>
        ${renderSettlement(s, st, false)}
        <button class="btn primary wide" data-action="ask-close">Sessie afsluiten</button>`;
    } catch (e) {
      preview = `<div class="check bad">${esc((e as Error).message)}</div>`;
    }
  }

  return `
    <div class="card">
      <h2>Controle 1 · Eindtelling</h2>
      <div class="kv"><span>Totaal ingekocht</span><b>${formatEuro(check.totalBuyIns)}</b></div>
      <div class="kv"><span>Totaal eindstacks</span><b>${formatEuro(check.totalStacks)}</b></div>
      ${status}
    </div>
    <div class="card">
      <h2>Controle 2 · Cash in de pot</h2>
      <div class="kv"><span>Verwachte cash in de pot</span><b class="cash-text">${formatEuro(pot)}</b></div>
      <label class="checkline"><input type="checkbox" data-action="pot-checked" ${s.potChecked ? 'checked' : ''}> Cash in de pot klopt</label>
    </div>
    ${preview}`;
}

// ───────────────────────── Afrekening ─────────────────────────

export function renderSettlement(s: Session, st: Settlement, withPaid: boolean): string {
  const results = [...st.results]
    .sort((a, b) => b.result - a.result || a.name.localeCompare(b.name, 'nl'))
    .map(
      (r) => `
      <div class="result-row">
        <div><div class="player-name">${esc(r.name)}</div>
        <div class="muted small">ingekocht ${formatEuro(r.total)} · eindstack ${formatEuro(r.finalStack)}</div></div>
        <div class="result ${signClass(r.result)}">${formatSigned(r.result)}</div>
      </div>`,
    )
    .join('');

  const payouts = st.cashPayouts.length
    ? st.cashPayouts.map((c) => `<li class="pay-row cash-row">${esc(payoutText(s, c))}</li>`).join('')
    : '<li class="muted">Geen cash uit te delen.</li>';

  const transfers = st.transfers.length
    ? st.transfers
        .map((t, i) => {
          const text = `<b>${esc(t.fromName)}</b> betaalt ${formatEuro(t.amount)} aan <b>${esc(t.toName)}</b>`;
          return withPaid
            ? `<li class="pay-row"><label class="checkline ${s.paid[i] ? 'done' : ''}">
                 <input type="checkbox" data-action="toggle-paid" data-session="${s.id}" data-index="${i}" ${s.paid[i] ? 'checked' : ''}>
                 <span>${text}</span><span class="paid-label">betaald</span></label></li>`
            : `<li class="pay-row">${text}</li>`;
        })
        .join('')
    : '<li class="muted">Geen overschrijvingen nodig.</li>';

  const nw = (cents: number, signed = false) => `<span class="nw">${signed ? formatSigned(cents) : formatEuro(cents)}</span>`;
  const checks = st.checks
    .map((c) => {
      const paid = c.cashPaid + c.transfersPaid;
      return `
      <li class="${c.ok ? '' : 'neg'}">
        <b>${esc(c.name)}</b> ${c.ok ? '✓' : '✗'}<br>
        ontvangen ${nw(c.received)} − betaald ${nw(paid)}
        <span class="muted">(cash ${nw(c.cashPaid)} + overschrijving ${nw(c.transfersPaid)})</span>
        = ${nw(c.received - paid, true)} = resultaat ${nw(c.result, true)}
      </li>`;
    })
    .join('');

  return `
    <div class="card"><h2>Resultaten</h2>${results}</div>
    <div class="card"><h2>Cash uit de pot – nu uitdelen</h2>
      <div class="muted small">Pot: ${formatEuro(st.pot)}</div><ul class="plain">${payouts}</ul></div>
    <div class="card"><h2>Overschrijvingen</h2><ul class="plain">${transfers}</ul></div>
    <details class="card"><summary><h2>Controle per speler</h2></summary><ul class="plain checks">${checks}</ul></details>`;
}

// ───────────────────────── Geschiedenis ─────────────────────────

export interface OpenTransfer {
  session: Session;
  index: number;
}

export function openTransfers(data: AppData): OpenTransfer[] {
  const out: OpenTransfer[] = [];
  for (const s of data.history) {
    s.settlement?.transfers.forEach((_, index) => {
      if (!s.paid[index]) out.push({ session: s, index });
    });
  }
  return out;
}

export function renderHistoryTab(data: AppData, ui: UiState): string {
  if (ui.historyId) {
    const s = data.history.find((x) => x.id === ui.historyId);
    if (s && s.settlement) return renderHistoryDetail(data, s);
  }
  const open = openTransfers(data);
  const openHtml = open.length
    ? `<ul class="plain">${open
        .map(({ session: s, index: i }) => {
          const t = s.settlement!.transfers[i];
          return `<li class="pay-row"><label class="checkline">
            <input type="checkbox" data-action="toggle-paid" data-session="${s.id}" data-index="${i}">
            <span><b>${esc(t.fromName)}</b> betaalt ${formatEuro(t.amount)} aan <b>${esc(t.toName)}</b>
            <span class="muted small">· ${esc(formatDateShort(s.date))}</span></span></label></li>`;
        })
        .join('')}</ul>`
    : '<p class="muted">Alles is betaald. 🎉</p>';

  const sessions = data.history.length
    ? data.history
        .map((s) => {
          const st = s.settlement!;
          const total = st.results.reduce((a, r) => a + r.total, 0);
          const openCount = s.paid.filter((p) => !p).length;
          return `<button class="card history-item" data-action="open-history" data-id="${s.id}">
            <div><div class="player-name cap">${esc(formatDateLong(s.date))}</div>
            <div class="muted small">${s.players.length} spelers · ${formatEuro(total)} ingekocht</div></div>
            <div class="small ${openCount ? 'warn-text' : 'muted'}">${openCount ? `${openCount} open` : 'betaald ✓'}</div>
          </button>`;
        })
        .join('')
    : '<p class="empty">Nog geen afgesloten sessies.</p>';

  return `
    <div class="card"><h2>Openstaande overschrijvingen</h2>${openHtml}</div>
    <h2 class="section-title">Afgesloten sessies</h2>
    ${sessions}
    <div class="card">
      <h2>Backup</h2>
      <p class="muted small">Bewaar af en toe een backup: de data staat enkel op dit toestel.</p>
      <div class="row">
        <button class="btn secondary" data-action="export">Exporteer JSON</button>
        <label class="btn secondary">Importeer JSON<input type="file" accept="application/json,.json" data-action="import" hidden></label>
      </div>
    </div>`;
}

function renderHistoryDetail(data: AppData, s: Session): string {
  const reopen = canReopen(s)
    ? data.active
      ? '<p class="muted small">Heropenen kan pas als er geen actieve sessie is.</p>'
      : `<button class="btn secondary wide" data-action="ask-reopen" data-id="${s.id}">Sessie heropenen</button>`
    : '';
  return `
    <button class="link back" data-action="close-history">← Geschiedenis</button>
    <h1 class="cap">${esc(formatDateLong(s.date))}</h1>
    ${renderSettlement(s, s.settlement!, true)}
    <button class="btn primary wide" data-action="copy-whatsapp" data-id="${s.id}">Kopieer voor WhatsApp</button>
    ${reopen}`;
}

// ───────────────────────── Sheets ─────────────────────────

export function renderSheet(data: AppData, sheet: Sheet, error: string | null, draftName = ''): string {
  const s = data.active;
  const err = error ? `<div class="check bad">${esc(error)}</div>` : '';
  let body = '';
  switch (sheet.kind) {
    case 'buyin': {
      const p = s?.players.find((x) => x.id === sheet.playerId);
      if (!s || !p) return '';
      const hasBuyIns = s.buyIns.some((b) => b.playerId === p.id);
      const btn = (m: 'cash' | 'later') =>
        `<button class="btn method ${m} ${p.lastMethod === m ? 'preselected' : ''}" data-action="buyin" data-method="${m}">
          ${METHOD_LABEL[m]}${hasBuyIns && p.lastMethod === m ? '<span class="hint">laatst gekozen</span>' : ''}</button>`;
      body = `
        <h2>Inkoop · ${esc(p.name)}</h2>
        <label class="field amount-field">Bedrag (€)
          <input id="buyin-amount" inputmode="decimal" enterkeyhint="done"
            value="${esc(sheet.amountText ?? centsToInput(s.defaultBuyIn))}"></label>
        ${err}
        <div class="method-row">${btn('cash')}${btn('later')}</div>
        <button class="btn ghost wide" data-action="close-sheet">Annuleren</button>`;
      break;
    }
    case 'addPlayer': {
      if (!s) return '';
      const taken = new Set(s.players.map((p) => p.name.toLocaleLowerCase('nl')));
      const quick = data.knownNames.filter((n) => !taken.has(n.toLocaleLowerCase('nl')));
      body = `
        <h2>Speler toevoegen</h2>
        <form data-form="add-player" class="row">
          <input id="player-name" placeholder="Naam" autocomplete="off" autocapitalize="words" autofocus value="${esc(draftName)}">
          <button class="btn primary" type="submit">Voeg toe</button>
        </form>
        ${err}
        ${quick.length ? `<div class="muted small">Vorige spelers</div><div class="chips">${quick.map((n) => `<button class="chip" data-action="add-known" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
        ${s.players.length ? `<div class="muted small">Aan tafel: ${esc(s.players.map((p) => p.name).join(', '))}</div>` : ''}
        <button class="btn ghost wide" data-action="close-sheet">Klaar</button>`;
      break;
    }
    case 'playerMenu': {
      const p = s?.players.find((x) => x.id === sheet.playerId);
      if (!s || !p) return '';
      const hasBuyIns = s.buyIns.some((b) => b.playerId === p.id);
      body = `
        <h2>${esc(p.name)}</h2>
        ${err}
        ${
          p.cashedOut
            ? `<button class="btn secondary wide" data-action="return-to-table" data-id="${p.id}">Terug aan tafel</button>`
            : `<button class="btn secondary wide" data-action="open-cashout" data-id="${p.id}">Uitcashen (vertrekt vroeger)</button>`
        }
        <button class="btn secondary wide" data-action="toggle-bank" data-id="${p.id}">${p.isBank ? 'Is niet meer de bank' : 'Aanduiden als bank'}</button>
        ${hasBuyIns ? '' : `<button class="btn danger wide" data-action="ask-remove-player" data-id="${p.id}">Speler verwijderen</button>`}
        <button class="btn ghost wide" data-action="close-sheet">Annuleren</button>`;
      break;
    }
    case 'cashout': {
      const p = s?.players.find((x) => x.id === sheet.playerId);
      if (!s || !p) return '';
      const sum = playerSummary(s, p.id);
      body = `
        <h2>Uitcashen · ${esc(p.name)}</h2>
        <p class="muted">Ingekocht: ${formatEuro(sum.total)} (cash ${formatEuro(sum.cash)} · ${METHOD_SHORT.later} ${formatEuro(sum.later)})</p>
        <p class="muted small">${esc(p.name)} wordt inactief en telt mee in de afrekening op het einde.</p>
        <label class="field">Eindstack (€)<input id="cashout-amount" inputmode="decimal" autofocus></label>
        ${err}
        <button class="btn primary wide" data-action="cashout" data-id="${p.id}">Uitcashen</button>
        <button class="btn ghost wide" data-action="close-sheet">Annuleren</button>`;
      break;
    }
    case 'defaultBuyIn': {
      if (!s) return '';
      body = `
        <h2>Standaard inkoop</h2>
        <label class="field">Bedrag (€)<input id="default-amount" inputmode="decimal" value="${centsToInput(s.defaultBuyIn)}" autofocus></label>
        ${err}
        <button class="btn primary wide" data-action="save-default-buyin">Opslaan</button>
        <button class="btn ghost wide" data-action="close-sheet">Annuleren</button>`;
      break;
    }
    case 'confirm':
      body = `
        <h2>${esc(sheet.title)}</h2>
        <p>${sheet.body}</p>
        ${err}
        <button class="btn ${sheet.danger ? 'danger' : 'primary'} wide" data-action="confirm">${esc(sheet.confirmLabel)}</button>
        <button class="btn ghost wide" data-action="close-sheet">Annuleren</button>`;
      break;
  }
  return `<div class="backdrop" data-action="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true">${body}</div>`;
}
