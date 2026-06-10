/**
 * API CRM — VeroCRM su HubSpot (proxy verso HubSpot CRM v3).
 *   GET    /api/crm/dashboard            → KPI aggregati
 *   GET    /api/crm/:entity              → lista (mappata sullo schema UI)
 *   GET    /api/crm/:entity/:id          → singolo record
 *   POST   /api/crm/:entity              → crea
 *   PUT    /api/crm/:entity/:id          → aggiorna
 *   DELETE /api/crm/:entity/:id          → elimina
 *
 * entity ∈ { aziende(companies) · contatti(contacts) · trattative(deals) · preventivi(quotes) }
 *
 * Auth verso il CLIENT: x-admin-secret (stesso di /admin).
 * Auth verso HUBSPOT: env.HUBSPOT_TOKEN = Private App access token (pat-...).
 *   Scope minimi: crm.objects.contacts/companies/deals/quotes (read+write).
 * Senza HUBSPOT_TOKEN → 503 e la pagina /crm mostra i dati demo.
 *
 * NB: le mappature di fase deal e stato lead usano le pipeline/proprietà DI DEFAULT
 *     di HubSpot; vanno verificate sulla configurazione reale dell'account.
 */

interface Env {
  HUBSPOT_TOKEN?: string;
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

const HS = 'https://api.hubapi.com';
async function hs(env: Env, path: string, init?: RequestInit): Promise<Response> {
  return fetch(HS + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.HUBSPOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

// entity UI → object type HubSpot
const OBJ: Record<string, string> = { aziende: 'companies', contatti: 'contacts', trattative: 'deals', preventivi: 'quotes' };

// dealstage (default sales pipeline) → fase UI
const STAGE_TO_FASE: Record<string, string> = {
  appointmentscheduled: 'lead',
  qualifiedtobuy: 'qualificato',
  presentationscheduled: 'proposta',
  decisionmakerboughtin: 'negoziazione',
  contractsent: 'proposta',
  closedwon: 'vinta',
  closedlost: 'persa',
};
const FASE_TO_STAGE: Record<string, string> = {
  lead: 'appointmentscheduled',
  qualificato: 'qualifiedtobuy',
  proposta: 'presentationscheduled',
  negoziazione: 'decisionmakerboughtin',
  vinta: 'closedwon',
  persa: 'closedlost',
};
function leadStato(s?: string): string {
  const v = (s || '').toUpperCase();
  if (['IN_PROGRESS', 'OPEN_DEAL', 'CONNECTED'].includes(v)) return 'active';
  if (['UNQUALIFIED', 'BAD_TIMING'].includes(v)) return 'cold';
  return 'lead';
}
function compTipo(t?: string): string {
  const v = (t || '').toUpperCase();
  if (v === 'PROSPECT') return 'prospect';
  if (['PARTNER', 'RESELLER', 'VENDOR'].includes(v)) return 'cliente';
  return 'prospect';
}

// proprietà richieste per ogni object type
const PROPS: Record<string, string> = {
  companies: 'name,type,city,phone,domain',
  contacts: 'firstname,lastname,jobtitle,email,phone,hs_lead_status,company',
  deals: 'dealname,amount,dealstage,hs_deal_stage_probability,hubspot_owner_id',
  quotes: 'hs_title,hs_quote_amount,hs_status,hs_expiration_date',
};

interface HsObj { id: string; properties: Record<string, string> }

function mapOut(entity: string, o: HsObj, companyById?: Map<string, string>): Record<string, unknown> {
  const p = o.properties || {};
  if (entity === 'aziende') return { id: o.id, nome: p.name, tipo: compTipo(p.type), citta: p.city, telefono: p.phone };
  if (entity === 'contatti') return { id: o.id, nome: `${p.firstname || ''} ${p.lastname || ''}`.trim(), ruolo: p.jobtitle, azienda: p.company, email: p.email, telefono: p.phone, stato: leadStato(p.hs_lead_status), priorita: 2 };
  if (entity === 'trattative') {
    const azId = (o as unknown as { _companyId?: string })._companyId;
    return { id: o.id, titolo: p.dealname, valore: Number(p.amount || 0), fase: STAGE_TO_FASE[p.dealstage] || 'lead', probabilita: Math.round(Number(p.hs_deal_stage_probability || 0) * 100), azienda: (azId && companyById?.get(azId)) || '', owner: '' };
  }
  if (entity === 'preventivi') return { id: o.id, numero: o.id, titolo: p.hs_title, totale: Number(p.hs_quote_amount || 0), stato: (p.hs_status || 'draft').toLowerCase() };
  return { id: o.id, ...p };
}

function mapIn(entity: string, body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (entity === 'aziende') { if (body.nome) p.name = body.nome; if (body.citta) p.city = body.citta; if (body.telefono) p.phone = body.telefono; }
  else if (entity === 'contatti') {
    if (body.nome) { const parts = String(body.nome).split(' '); p.firstname = parts.shift(); p.lastname = parts.join(' '); }
    if (body.ruolo) p.jobtitle = body.ruolo; if (body.email) p.email = body.email; if (body.telefono) p.phone = body.telefono; if (body.azienda) p.company = body.azienda;
  } else if (entity === 'trattative') {
    if (body.titolo) p.dealname = body.titolo; if (body.valore !== undefined) p.amount = body.valore;
    if (body.fase) p.dealstage = FASE_TO_STAGE[String(body.fase)] || 'appointmentscheduled';
  }
  return p;
}

async function listEntity(env: Env, entity: string): Promise<Response> {
  const obj = OBJ[entity];
  const withAssoc = entity === 'trattative' ? '&associations=companies' : '';
  const r = await hs(env, `/crm/v3/objects/${obj}?limit=100&properties=${PROPS[obj]}${withAssoc}`);
  if (!r.ok) return json({ ok: false, error: 'hubspot', status: r.status, detail: await r.text() }, 502);
  const data = (await r.json()) as { results: HsObj[] };

  // per le trattative, risolvi il nome azienda dall'associazione
  let companyById: Map<string, string> | undefined;
  if (entity === 'trattative') {
    companyById = new Map();
    for (const d of data.results) {
      const assoc = (d as unknown as { associations?: { companies?: { results?: { id: string }[] } } }).associations;
      const cid = assoc?.companies?.results?.[0]?.id;
      if (cid) (d as unknown as { _companyId?: string })._companyId = cid;
    }
    const ids = [...new Set(data.results.map((d) => (d as unknown as { _companyId?: string })._companyId).filter(Boolean))] as string[];
    if (ids.length) {
      const cr = await hs(env, `/crm/v3/objects/companies/batch/read`, {
        method: 'POST',
        body: JSON.stringify({ properties: ['name'], inputs: ids.map((id) => ({ id })) }),
      });
      if (cr.ok) { const cd = (await cr.json()) as { results: HsObj[] }; cd.results.forEach((c) => companyById!.set(c.id, c.properties.name)); }
    }
  }
  return json({ ok: true, items: data.results.map((o) => mapOut(entity, o, companyById)) });
}

async function dashboard(env: Env): Promise<Response> {
  const [contacts, deals] = await Promise.all([
    hs(env, `/crm/v3/objects/contacts?limit=1&properties=email`),
    hs(env, `/crm/v3/objects/deals?limit=100&properties=amount,dealstage`),
  ]);
  if (!deals.ok) return json({ ok: false, error: 'hubspot', status: deals.status }, 502);
  const dd = (await deals.json()) as { results: HsObj[]; total?: number };
  const cc = contacts.ok ? ((await contacts.json()) as { total?: number }) : {};
  let aperte = 0, pipeline = 0, vinte = 0, fatturato = 0;
  for (const d of dd.results) {
    const fase = STAGE_TO_FASE[d.properties.dealstage] || 'lead';
    const val = Number(d.properties.amount || 0);
    if (fase === 'vinta') { vinte++; fatturato += val; }
    else if (fase !== 'persa') { aperte++; pipeline += val; }
  }
  return json({ ok: true, kpi: { contatti: cc.total ?? 0, trattative_aperte: aperte, valore_pipeline: pipeline, vinte, fatturato_vinte: fatturato } });
}

function parsePath(url: URL): { entity: string; id: string | null } {
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  return { entity: parts[2] || '', id: parts[3] || null };
}

export const onRequest = async (ctx: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = ctx;
  if (!auth(request, env)) return json({ ok: false, error: 'non_autorizzato' }, 401);
  if (!env.HUBSPOT_TOKEN) return json({ ok: false, error: 'hubspot_non_configurato' }, 503);
  const url = new URL(request.url);
  const { entity, id } = parsePath(url);

  try {
    if (entity === 'dashboard') return await dashboard(env);
    if (!(entity in OBJ)) return json({ ok: false, error: 'entita_sconosciuta' }, 404);
    const obj = OBJ[entity];

    switch (request.method) {
      case 'GET': {
        if (id) {
          const r = await hs(env, `/crm/v3/objects/${obj}/${id}?properties=${PROPS[obj]}`);
          if (!r.ok) return json({ ok: false, error: 'hubspot', status: r.status }, r.status === 404 ? 404 : 502);
          return json({ ok: true, item: mapOut(entity, (await r.json()) as HsObj) });
        }
        return await listEntity(env, entity);
      }
      case 'POST': {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const properties = mapIn(entity, body);
        if (!Object.keys(properties).length) return json({ ok: false, error: 'nessun_campo' }, 400);
        const r = await hs(env, `/crm/v3/objects/${obj}`, { method: 'POST', body: JSON.stringify({ properties }) });
        if (!r.ok) return json({ ok: false, error: 'hubspot', status: r.status, detail: await r.text() }, 502);
        return json({ ok: true, item: mapOut(entity, (await r.json()) as HsObj) }, 201);
      }
      case 'PUT': {
        if (!id) return json({ ok: false, error: 'id_mancante' }, 400);
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const properties = mapIn(entity, body);
        if (!Object.keys(properties).length) return json({ ok: false, error: 'nessun_campo' }, 400);
        const r = await hs(env, `/crm/v3/objects/${obj}/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
        if (!r.ok) return json({ ok: false, error: 'hubspot', status: r.status, detail: await r.text() }, 502);
        return json({ ok: true });
      }
      case 'DELETE': {
        if (!id) return json({ ok: false, error: 'id_mancante' }, 400);
        const r = await hs(env, `/crm/v3/objects/${obj}/${id}`, { method: 'DELETE' });
        if (!r.ok && r.status !== 404) return json({ ok: false, error: 'hubspot', status: r.status }, 502);
        return json({ ok: true });
      }
      default:
        return json({ ok: false, error: 'metodo_non_supportato' }, 405);
    }
  } catch (e) {
    return json({ ok: false, error: 'errore', detail: String(e instanceof Error ? e.message : e) }, 500);
  }
};
