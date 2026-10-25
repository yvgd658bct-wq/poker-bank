# Poker Bank

Offline PWA (iPhone) waarmee één persoon aan tafel alle inkopen van een poker-cashgame registreert
en op het einde berekent wie hoeveel aan wie moet betalen (cash én uitgestelde betalingen).

Toetsvraag voor elke ontwerpkeuze: maakt dit de registratie betrouwbaarder of de afrekening duidelijker? Zo niet, weglaten.

## Begrippen (consequent gebruiken in code en interface)

| Term | Code | Betekenis |
|---|---|---|
| Bank | `isBank` | Persoon met het toestel; beheert app en cash pot. Speelt meestal mee. |
| Inkoop | `BuyIn` | Bedrag aan fiches. Standaard €30, aanpasbaar per sessie en per inkoop. |
| Betaalwijze | `PayMethod` = `'cash' \| 'later'` | Per inkoop; kan verschillen bij dezelfde speler. |
| Pot | `pot` | Cash bij de bank = som van alle cash-inkopen. |
| Eindstack | `finalStack` | Waarde in euro van de fiches op het einde of bij vroegtijdig vertrek. |
| Resultaat | `result` | eindstack − totaal ingekocht. |
| Saldo | `saldo` | eindstack − inkopen `later`. Positief = krijgt nog, negatief = moet betalen. |

## Vaste ontwerpkeuzes

- Eén toestel: geen accounts, login, server of synchronisatie.
- Volledig offline, installeerbaar op iPhone-beginscherm (PWA).
- Geld altijd in centen (integers, type `Cents`), nooit floats.
- Interface in het Nederlands (Vlaams); bedragen via `Intl.NumberFormat('nl-BE')` → `€ 30,00`.
- Vite + TypeScript, geen UI-framework (kleine eigen render-helper) + Vitest.
- Opslag in localStorage, try/catch rond elke lees- en schrijfactie.
- Rekenlogica in `src/logic/` : puur (geen DOM, geen opslag), volledig getest.

## Afrekenalgoritme (`src/logic/settle.ts`)

1. Saldo per speler.
2. Pot als virtuele deelnemer met saldo −(totaal cash). Som saldi moet 0 zijn, anders fout.
3. Pot deelt eerst uit aan positieve saldi (grootste eerst).
4. Rest: greedy, grootste schuldenaar betaalt grootste schuldeiser.
Gelijke bedragen: tiebreak op naam (deterministisch).

## Gemaakte keuzes bij open vragen

- Eén speler kan als bank aangeduid worden; diens uitbetaling heet "Bank houdt € Y".
- Vroegtijdig vertrek: geen tussentijdse uitbetaling, telt mee in de eindafrekening. "Terug aan tafel" mogelijk.
- Undo: alle mutaties van de actieve sessie, meerdere stappen terug.
- Afgesloten sessie heropenen kan zolang geen overschrijving afgevinkt is en er geen actieve sessie is.

## Buiten scope v1

Accounts/meerdere toestellen, betalingen uitvoeren of betaalverzoeken, fiches per kleur, statistieken/klassementen.

## Structuur

- `src/logic/` : money (parse/format), settle (afrekening), puur + `*.test.ts`
- `src/storage.ts` : localStorage, import/export-validatie
- `src/ui/` : schermen (vanilla TS, event-delegatie via `data-action`)
- `public/` : manifest, iconen; `sw.js` wordt bij build gegenereerd (zie `vite.config.ts`)

## Commando's

```bash
npm install
npm run dev       # lokale server (ook bereikbaar op LAN)
npm test          # Vitest
npm run build     # typecheck + build naar dist/
npm run preview   # gebouwde versie lokaal (service worker actief)
npm run icons     # iconen opnieuw genereren
```
