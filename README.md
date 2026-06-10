# Area Clienti VeroLED — Fleet Monitor PRO

Portale clienti per la gestione dei LED wall NovaStar via **VNNOX OpenAPI**.
Progetto **autonomo** (Astro + Cloudflare Pages), deploy su **areaclienti.veroledsrl.com**.
Indipendente dal sito veroledsrl.com: i suoi deploy non lo toccano.

## Struttura
- `src/pages/index.astro` — portale cliente (login + dashboard schermi). Sta alla **root** `/`.
- `src/pages/admin.astro` — pannello admin per creare i clienti e assegnare gli schermi (`/admin`).
- `src/pages/crm.astro` — **VeroCRM**: gestione clienti/trattative/preventivi (`/crm`).
- `functions/api/*` — login, screens, control, vnnox-callback; `functions/api/admin/clienti` (provisioning); `functions/api/crm/*` (CRM su HubSpot).
- `functions/_lib/*` — `vnnox.ts` (client OpenAPI), `portaleauth.ts` (auth+sessioni), `crypto.ts`.

## CRM (VeroCRM · `/crm`)
Interfaccia CRM su misura VeroLED, stile coerente col Fleet Monitor, con **HubSpot come backend**.
- **Dati**: HubSpot CRM. Le Functions `functions/api/crm/[[route]].ts` fanno da **proxy**
  verso l'API HubSpot CRM v3 (`/api/crm/{aziende|contatti|trattative|preventivi}` +
  `/api/crm/dashboard`). Protette da `x-admin-secret` (stesso segreto di `/admin`).
- **Token**: variabile **`HUBSPOT_TOKEN`** = *Private App access token* di HubSpot
  (Settings → Integrations → Private Apps; scope `crm.objects.*` read+write). Va messa in
  Cloudflare Pages → Settings → Environment variables. Senza token `/api/crm/*` risponde
  503 e `/crm` mostra i **dati demo** (badge "dati demo").
- **Mappatura**: aziende↔companies, contatti↔contacts, trattative↔deals, preventivi↔quotes.
  Le fasi deal e gli stati lead usano le pipeline/proprietà **di default** di HubSpot:
  da verificare sulla configurazione reale dell'account.

## Setup Cloudflare Pages (una tantum)
1. Crea un **repo GitHub** e fai push di questa cartella.
2. Cloudflare → **Workers e Pages → Create → Pages → Connetti a Git** → seleziona il repo.
   - Build command: `npm run build`
   - Output directory: `dist`
3. **KV**: crea/collega un namespace come binding **`VEROLED_KV`** (Settings → Functions → KV namespace bindings), per Production e Preview.
   - **R2** (per l'upload dei contenuti nel Compositore): crea un bucket R2 e collegalo come binding **`MEDIA`** (Settings → Functions → R2 bucket bindings). I file caricati vengono serviti pubblicamente da `/api/media/{key}`. Senza questo binding il Compositore mostra solo l'anteprima locale.
4. **Environment variables** (Production e Preview):
   - `VNNOX_APPKEY`, `VNNOX_APPSECRET` — dalla NovaCloud Open Platform
   - `VNNOX_MODE` — `mock` per il demo, `live` per l'API reale
   - `PORTALE_SECRET` — stringa lunga e casuale (firma sessioni)
   - `ADMIN_SECRET` — password del pannello `/admin`
   - `VNNOX_CALLBACK_TOKEN` — token per `/api/vnnox-callback` (consigliato)
   - `VNNOX_BASE` — opzionale, default `https://open-eu.vnnox.com`
5. **Dominio**: sposta il custom domain `areaclienti.veroledsrl.com` su QUESTO progetto
   (rimuovilo dal progetto `veroled` e aggiungilo qui → CNAME aggiornato a questo `*.pages.dev`).

## Demo
In `VNNOX_MODE=mock` è attivo un login demo: utente **`demo`** / password **`veroled-demo`**
(mostra 3 schermi finti, senza KV). Si disattiva da solo con `VNNOX_MODE=live`.

## Stato VNNOX live
Pronti: stato online/offline, power (screen-status), reboot, callback luminosità.
Da completare con i dati reali: nome/modello/risoluzione (endpoint Player List),
temperatura/allarmi (VNNOX Care).
