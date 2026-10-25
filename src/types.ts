import type { Cents } from './logic/money';
import type { PayMethod, Settlement } from './logic/settle';

export type { Cents, PayMethod, Settlement };

export interface Player {
  id: string;
  name: string;
  isBank: boolean;
  /** Vroegtijdig vertrokken: inactief, telt mee in de afrekening. */
  cashedOut: boolean;
  /** Eindstack; null = nog niet ingevuld. */
  finalStack: Cents | null;
  /** Laatst gekozen betaalwijze, voorgeselecteerd bij de volgende inkoop. */
  lastMethod: PayMethod;
}

export interface BuyIn {
  id: string;
  playerId: string;
  amount: Cents;
  method: PayMethod;
  /** ISO-tijdstip */
  time: string;
}

export interface Session {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  defaultBuyIn: Cents;
  players: Player[];
  buyIns: BuyIn[];
  status: 'active' | 'closed';
  /** Controle 2: bank heeft bevestigd dat de cash in de pot klopt. */
  potChecked: boolean;
  closedAt: string | null;
  settlement: Settlement | null;
  /** Per overschrijving (zelfde index als settlement.transfers): betaald? */
  paid: boolean[];
}

export interface UndoEntry {
  label: string;
  /** Toestand van de actieve sessie vóór de actie. */
  before: Session;
}

export interface AppData {
  version: 1;
  active: Session | null;
  undo: UndoEntry[];
  /** Afgesloten sessies, nieuwste eerst. */
  history: Session[];
  /** Namen van vorige sessies, voor snelle keuze. */
  knownNames: string[];
}
