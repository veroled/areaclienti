# HANDOFF — VeroCRM (Area Clienti VeroLED)

> Stato del lavoro sul CRM, da riprendere in una **nuova sessione** dopo aver abilitato
> il permesso **Read and write** alla GitHub App di Claude Code su `veroled/areaclienti`.

## Contesto
- Repo: `veroled/areaclienti` — Astro + Cloudflare Pages, portale **Fleet Monitor PRO** (LED wall NovaStar via VNNOX).
- Branch di lavoro: `claude/keen-hawking-5IH9c`
- Stile visivo del portale: accento ciano `#22a0c2` + verde `#89d155`, font *Cormorant Garamond* (titoli corsivi) + *Open Sans*.

## Cosa è stato fatto (template CRM, in `public/`)
4 mockup HTML autonomi e navigabili (vanilla JS, zero dipendenze):

| File | Descrizione |
|------|-------------|
| `public/crm-template.html` | Versione **dark**, coerente 100% col portale. Dashboard · Pipeline · Contatti · Attività · Report. |
| `public/crm-light.html` | Variante **light** (clean office), stesso layout sidebar. |
| `public/crm-mobile.html` | Variante **mobile-first** con bottom-nav stile app + bottom-sheet. |
| `public/crm.html` | ⭐ **VeroCRM Light COMPLETO** — versione scelta. 9 moduli (sotto). |

### Moduli di `crm.html` (la versione definitiva scelta)
Dashboard · Pipeline (kanban) · Contatti (tabella + drawer con tab) · Aziende (card) ·
Preventivi (righe prodotto LED + IVA → PDF) · **Schermi LED** (aggancio a `/api/screens` del
portale, stato live) · Attività (calendario + to-do + ticket) · Report · Impostazioni.

Decisioni prese con il cliente:
- **Tema: Light** (Variante A).
- Includere **tutte** le funzioni + moduli aggiuntivi utili (greenlight su "aggiungi ciò che ritieni opportuno").
- Il CRM "del collega" non è su nessun repo/branch/issue accessibile: vive solo in un'altra chat. I template qui sono la base di partimento condivisa.

## Prossimi passi (in ordine)
1. **Push** dei commit del branch `claude/keen-hawking-5IH9c` (bloccato finora da token read-only).
2. **Conversione in `src/pages/crm.astro`** con Layout condiviso col portale (estrarre lo stile in un componente comune a `index.astro`/`admin.astro`/`editor.astro`).
3. **Schema dati D1** (via Cloudflare MCP) — tabelle: `aziende`, `contatti`, `trattative`, `preventivi`, `attivita`, `note`. Binding tipo `VEROLED_KV` già esistente per le sessioni.
4. **Functions CRUD** in `functions/api/crm/*` sul modello degli endpoint esistenti (`/api/screens`, `/api/admin/clienti`).
5. Sostituire gli **array demo** in `crm.html`/`crm.astro` con `fetch('/api/crm/...')`.
6. **Aggancio schermi**: la vista "Schermi LED" riusa `/api/screens` per mostrare lo stato online/offline dei wall installati per ogni cliente.

## Connettori consigliati per il lavoro
- 🟢 **GitHub** + **Cloudflare** (D1/KV/R2) — essenziali.
- 🟡 **Gmail** (storico email/invio preventivi) + **Google Calendar** (sopralluoghi/scadenze) — alto valore.
- 🟠 Canva / Zapier — opzionali.
- 🔴 Ahrefs / Semrush / Indeed — non pertinenti.

## Come riprendere
In una **nuova sessione** sul repo, dopo aver dato il permesso Read+Write alla GitHub App:
> "Pusha il lavoro del CRM e poi convertiamo `crm.html` in `crm.astro`."
