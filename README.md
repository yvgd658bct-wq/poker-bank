# Poker Bank

Offline webapp (PWA) voor iPhone: registreert alle inkopen van een poker-cashgame en berekent
op het einde wie hoeveel aan wie moet betalen (cash uit de pot + overschrijvingen).

## Lokaal starten

Nodig: [Node.js](https://nodejs.org) 20 of nieuwer.

```bash
npm install
npm test          # alle tests
npm run dev       # ontwikkelserver, ook bereikbaar vanaf je iPhone op hetzelfde wifi-netwerk
```

`npm run dev` toont een adres zoals `http://192.168.x.x:5173`. Open dat in Safari op je iPhone om te testen.
(Offline werken en installeren vraagt https, zie hieronder.)

## Gratis publiceren via GitHub Pages

1. Maak op github.com een nieuwe repository, bv. `poker-bank` (mag publiek of privé*).
2. Push deze map:
   ```bash
   git remote add origin https://github.com/<jouw-naam>/poker-bank.git
   git push -u origin main
   ```
3. Op GitHub: **Settings → Pages → Source: GitHub Actions**.
4. De workflow (`.github/workflows/deploy.yml`) draait de tests, bouwt en publiceert. Na ±1 minuut staat de app op
   `https://<jouw-naam>.github.io/poker-bank/`.

\* Pages op een privé-repo vraagt een betaald GitHub-abonnement; de app bevat geen data, dus publiek is geen probleem.

## Installeren op de iPhone

1. Open de Pages-link in **Safari**.
2. Deel-knop → **Zet op beginscherm**.
3. Open de app één keer vanaf het beginscherm met internet; daarna werkt ze volledig offline.

Na een nieuwe versie publiceren: open de app twee keer (de eerste keer haalt ze de update op).

## Belangrijk over je data

De data staat enkel op je iPhone, in de app op het beginscherm (los van Safari). Maak af en toe een backup via
**Geschiedenis → Exporteer JSON**. Als je de app van het beginscherm verwijdert, is de data weg.
