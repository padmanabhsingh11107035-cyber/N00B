// NOOB — Edge Function "forms-webhook-run": sends the web hooks of NOOB Forms.
//
// Every new answer lines up one "delivery" per active web hook of the form (table form_webhook_deliveries, written by the database). This function sends what is waiting:
//   * a POST with a JSON body: { event: "form.response", form: { id, title }, response: { id, submittedAt, answers: [{ id, question, value }] } }
//   * signed: the header X-NOOB-Signature is "sha256=" + HMAC-SHA256 (hex) of the exact body, made with the secret of the web hook; X-NOOB-Delivery is the id of the delivery
//   * only https addresses on the public internet: an address that points to a private, local or cloud-metadata address is refused (the name is looked up and every address checked),
//     no redirects are followed, port 443 only, and a request is given 8 seconds
//   * a delivery that fails is tried again after 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then it is marked "failed"; what happened is written to the log (never the
//     answer of the other side)
//
// Who may call it:
//   * the DATABASE or a schedule: header  x-noob-push  holding the same secret as the other NOOB functions (internal_config.push_secret) -> sends everything that is due, for every form.
//     Set it up once: Supabase -> Integrations -> Cron -> every minute -> "Supabase Edge Function" -> forms-webhook-run, with the header above.
//   * the OWNER of a form from the app (button "Send what is waiting now"): a normal login and { formId } -> sends what is due for that form only.
// Deploy with "Verify JWT" OFF (the checks are done here). SUPABASE_URL, SUPABASE_ANON_KEY and the service key are provided automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-noob-push', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string): string => (Deno.env.get(k) || '').trim();
const serviceKey = (): string => {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (direct) return direct;
  try { const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}'); return keys.default || (Object.values(keys)[0] as string) || ''; } catch { return ''; }
};

// ---- the address must lead out to the public internet
function privateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function privateV6(ip: string): boolean {
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  if (x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb') || x.startsWith('ff')) return true;
  const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? privateV4(mapped[1]) : false;
}
async function publicAddress(raw: string): Promise<{ ok: true; url: URL } | { ok: false; why: string }> {
  let u: URL;
  try { u = new URL(raw); } catch { return { ok: false, why: 'bad address' }; }
  if (u.protocol !== 'https:') return { ok: false, why: 'not https' };
  if (u.port && u.port !== '443') return { ok: false, why: 'port not allowed' };
  if (u.username || u.password) return { ok: false, why: 'address with a login' };
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^[\d.]+$/.test(host)) return privateV4(host) ? { ok: false, why: 'private address' } : { ok: true, url: u };
  if (host.includes(':')) return privateV6(host) ? { ok: false, why: 'private address' } : { ok: true, url: u };
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.')) return { ok: false, why: 'local name' };
  let found = 0;
  for (const type of ['A', 'AAAA'] as const) {
    try {
      const list = await Deno.resolveDns(host, type);
      for (const ip of list as string[]) { found++; if (type === 'A' ? privateV4(ip) : privateV6(ip)) return { ok: false, why: 'private address' }; }
    } catch { /* no records of this kind */ }
  }
  return found ? { ok: true, url: u } : { ok: false, why: 'name not found' };
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('');
}
const BACKOFF_MIN = [1, 5, 30, 120, 720];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* the schedule sends nothing */ }
  const url = env('SUPABASE_URL'), key = serviceKey();
  if (!url || !key) return json({ error: 'not_configured' }, 503);
  const admin = createClient(url, key, { auth: { persistSession: false } });

  // who is calling
  let onlyForm: string | null = null;
  const pushHeader = req.headers.get('x-noob-push') ?? '';
  if (pushHeader) {
    const { data } = await admin.from('internal_config').select('value').eq('key', 'push_secret').maybeSingle();
    if (!data?.value || data.value !== pushHeader) return json({ error: 'denied' }, 403);
  } else {
    const auth = req.headers.get('Authorization') ?? '';
    const anon = env('SUPABASE_ANON_KEY');
    if (!auth.startsWith('Bearer ') || !anon || typeof body?.formId !== 'string') return json({ error: 'login' }, 401);
    const me = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getUser();
    if (!me.data.user) return json({ error: 'login' }, 401);
    const { data: f } = await admin.from('forms').select('id').eq('id', body.formId).eq('owner_id', me.data.user.id).maybeSingle();
    if (!f) return json({ error: 'denied' }, 403);
    onlyForm = f.id as string;
  }

  let q = admin.from('form_webhook_deliveries').select('id,webhook_id,response_id,attempts').eq('status', 'pending').lte('next_try', new Date().toISOString()).lt('attempts', 5).order('created_at').limit(50);
  if (onlyForm) {
    const { data: hooks } = await admin.from('form_webhooks').select('id').eq('form_id', onlyForm);
    q = q.in('webhook_id', (hooks ?? []).map((h) => h.id));
  }
  const { data: due } = await q;
  let sent = 0, failed = 0;
  for (const d of due ?? []) {
    const fail = async (why: string, status?: number) => {
      const attempts = d.attempts + 1;
      await admin.from('form_webhook_deliveries').update({ attempts, http_status: status ?? null, last_error: why.slice(0, 200), status: attempts >= 5 ? 'failed' : 'pending', next_try: new Date(Date.now() + BACKOFF_MIN[Math.min(attempts - 1, 4)] * 60_000).toISOString() }).eq('id', d.id);
      failed++;
    };
    const { data: hook } = await admin.from('form_webhooks').select('id,form_id,url,secret,active').eq('id', d.webhook_id).maybeSingle();
    if (!hook || !hook.active) { await admin.from('form_webhook_deliveries').update({ status: 'failed', last_error: 'web hook is off or gone' }).eq('id', d.id); failed++; continue; }
    const { data: resp } = d.response_id ? await admin.from('form_responses').select('id,created_at,answers,version').eq('id', d.response_id).maybeSingle() : { data: null };
    const { data: form } = await admin.from('forms').select('id,title,published').eq('id', hook.form_id).maybeSingle();
    if (!resp || !form) { await admin.from('form_webhook_deliveries').update({ status: 'failed', last_error: 'the answer or the form is gone' }).eq('id', d.id); failed++; continue; }
    const titles = new Map<string, string>(((form.published?.questions ?? []) as Array<{ id: string; title: string }>).map((x) => [x.id, x.title]));
    const payload = JSON.stringify({ event: 'form.response', form: { id: form.id, title: form.title }, response: { id: resp.id, submittedAt: resp.created_at, version: resp.version, answers: Object.entries(resp.answers as Record<string, unknown>).map(([id, value]) => ({ id, question: titles.get(id) ?? id, value })) } });
    const ok = await publicAddress(hook.url);
    if (!ok.ok) { await fail(ok.why); continue; }
    try {
      const res = await fetch(ok.url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'NOOB-Forms-Webhook/1', 'X-NOOB-Event': 'form.response', 'X-NOOB-Delivery': d.id, 'X-NOOB-Signature': 'sha256=' + await sign(hook.secret, payload) },
        body: payload
      });
      try { await res.body?.cancel(); } catch { /* not needed */ }
      if (res.status >= 200 && res.status < 300) { await admin.from('form_webhook_deliveries').update({ status: 'sent', attempts: d.attempts + 1, http_status: res.status, last_error: null, sent_at: new Date().toISOString() }).eq('id', d.id); sent++; }
      else await fail(res.status >= 300 && res.status < 400 ? 'the address redirects (not followed)' : `answered ${res.status}`, res.status);
    } catch (e) { await fail((e as Error).name === 'TimeoutError' ? 'no answer in 8 seconds' : 'could not connect'); }
  }
  return json({ ok: true, sent, failed });
});
