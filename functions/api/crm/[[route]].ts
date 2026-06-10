/**
 * API CRM — VeroCRM (Cloudflare D1).
 *   GET    /api/crm/dashboard            → KPI + aggregati per la dashboard
 *   GET    /api/crm/:entity              → lista (con join leggibili)
 *   GET    /api/crm/:entity/:id          → singolo record (+ figli dove utile)
 *   POST   /api/crm/:entity              → crea
 *   PUT    /api/crm/:entity/:id          → aggiorna
 *   DELETE /api/crm/:entity/:id          → elimina
 *
 * entity ∈ { aziende, contatti, trattative, preventivi, attivita }
 * Protetto da x-admin-secret. Richiede il binding D1 `VEROCRM_DB`.
 */

// Tipi D1 minimi (il progetto non usa @cloudflare/workers-types, vedi portaleauth.ts/upload.ts).
interface D1Result<T = unknown> {
  results?: T[];
  meta: { last_row_id: number; changes: number };
}
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

interface Env {
  VEROCRM_DB?: D1Database;
  ADMIN_SECRET?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
function auth(request: Request, env: Env): boolean {
  const h = request.headers.get('x-admin-secret') || '';
  return Boolean(env.ADMIN_SECRET) && h === env.ADMIN_SECRET;
}

// Colonne scrivibili per tabella (whitelist → niente SQL injection sui nomi colonna).
const FIELDS: Record<string, string[]> = {
  aziende:    ['nome', 'tipo', 'piva', 'email', 'telefono', 'citta', 'provincia', 'note'],
  contatti:   ['azienda_id', 'nome', 'ruolo', 'email', 'telefono', 'stato', 'priorita', 'note'],
  trattative: ['azienda_id', 'contatto_id', 'titolo', 'fase', 'valore', 'probabilita', 'owner'],
  preventivi: ['numero', 'azienda_id', 'contatto_id', 'trattativa_id', 'stato', 'imponibile', 'iva_perc', 'totale', 'data'],
  attivita:   ['tipo', 'titolo', 'azienda_id', 'contatto_id', 'trattativa_id', 'scadenza', 'completata', 'note'],
};
// SELECT di lista, con il nome azienda risolto dove ha senso.
const LIST_SQL: Record<string, string> = {
  aziende:    `SELECT * FROM aziende ORDER BY nome`,
  contatti:   `SELECT c.*, a.nome AS azienda FROM contatti c LEFT JOIN aziende a ON a.id=c.azienda_id ORDER BY c.nome`,
  trattative: `SELECT t.*, a.nome AS azienda, c.nome AS contatto FROM trattative t LEFT JOIN aziende a ON a.id=t.azienda_id LEFT JOIN contatti c ON c.id=t.contatto_id ORDER BY t.updated_at DESC`,
  preventivi: `SELECT p.*, a.nome AS azienda FROM preventivi p LEFT JOIN aziende a ON a.id=p.azienda_id ORDER BY p.data DESC`,
  attivita:   `SELECT t.*, a.nome AS azienda, c.nome AS contatto FROM attivita t LEFT JOIN aziende a ON a.id=t.azienda_id LEFT JOIN contatti c ON c.id=t.contatto_id ORDER BY t.scadenza`,
};

function parsePath(url: URL): { entity: string; id: string | null } {
  // /api/crm/<entity>/<id?>
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/'); // ['api','crm','entity','id?']
  return { entity: parts[2] || '', id: parts[3] || null };
}

async function dashboard(db: D1Database): Promise<Response> {
  const [contatti, aperte, vinte, fasi, mesi] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS n FROM contatti`).first<{ n: number }>(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(valore),0) AS tot FROM trattative WHERE fase NOT IN ('vinta','persa')`).first<{ n: number; tot: number }>(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(valore),0) AS tot FROM trattative WHERE fase='vinta'`).first<{ n: number; tot: number }>(),
    db.prepare(`SELECT fase, COUNT(*) AS n, COALESCE(SUM(valore),0) AS tot FROM trattative GROUP BY fase`).all(),
    db.prepare(`SELECT substr(data,1,7) AS mese, COALESCE(SUM(totale),0) AS tot FROM preventivi WHERE stato='won' GROUP BY mese ORDER BY mese`).all(),
  ]);
  return json({
    ok: true,
    kpi: {
      contatti: contatti?.n ?? 0,
      trattative_aperte: aperte?.n ?? 0,
      valore_pipeline: aperte?.tot ?? 0,
      vinte: vinte?.n ?? 0,
      fatturato_vinte: vinte?.tot ?? 0,
    },
    per_fase: fasi.results ?? [],
    fatturato_mese: mesi.results ?? [],
  });
}

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!auth(request, env)) return json({ ok: false, error: 'non_autorizzato' }, 401);
  if (!env.VEROCRM_DB) return json({ ok: false, error: 'd1_non_configurato' }, 503);
  const db = env.VEROCRM_DB;
  const url = new URL(request.url);
  const { entity, id } = parsePath(url);

  if (entity === 'dashboard') return dashboard(db);
  if (!(entity in FIELDS)) return json({ ok: false, error: 'entita_sconosciuta' }, 404);
  const cols = FIELDS[entity];

  try {
    switch (request.method) {
      case 'GET': {
        if (id) {
          const row = await db.prepare(`SELECT * FROM ${entity} WHERE id=?`).bind(id).first();
          if (!row) return json({ ok: false, error: 'non_trovato' }, 404);
          // figli utili
          if (entity === 'preventivi') {
            const righe = await db.prepare(`SELECT * FROM preventivo_righe WHERE preventivo_id=?`).bind(id).all();
            return json({ ok: true, item: { ...row, righe: righe.results ?? [] } });
          }
          return json({ ok: true, item: row });
        }
        const list = await db.prepare(LIST_SQL[entity]).all();
        return json({ ok: true, items: list.results ?? [] });
      }
      case 'POST': {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const used = cols.filter((c) => body[c] !== undefined);
        if (!used.length) return json({ ok: false, error: 'nessun_campo' }, 400);
        const sql = `INSERT INTO ${entity} (${used.join(',')}) VALUES (${used.map(() => '?').join(',')})`;
        const res = await db.prepare(sql).bind(...used.map((c) => body[c] as never)).run();
        return json({ ok: true, id: res.meta.last_row_id }, 201);
      }
      case 'PUT': {
        if (!id) return json({ ok: false, error: 'id_mancante' }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const used = cols.filter((c) => body[c] !== undefined);
        if (!used.length) return json({ ok: false, error: 'nessun_campo' }, 400);
        const setClause = used.map((c) => `${c}=?`).join(',');
        const hasUpdatedAt = ['aziende', 'contatti', 'trattative'].includes(entity);
        const sql = `UPDATE ${entity} SET ${setClause}${hasUpdatedAt ? ", updated_at=datetime('now')" : ''} WHERE id=?`;
        const res = await db.prepare(sql).bind(...used.map((c) => body[c] as never), id).run();
        return json({ ok: true, changes: res.meta.changes });
      }
      case 'DELETE': {
        if (!id) return json({ ok: false, error: 'id_mancante' }, 400);
        const res = await db.prepare(`DELETE FROM ${entity} WHERE id=?`).bind(id).run();
        return json({ ok: true, changes: res.meta.changes });
      }
      default:
        return json({ ok: false, error: 'metodo_non_supportato' }, 405);
    }
  } catch (e) {
    return json({ ok: false, error: 'errore_db', detail: String(e instanceof Error ? e.message : e) }, 500);
  }
};
