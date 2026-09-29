// NOOB — Edge Function "agora-token".
//
// Mints a short-lived Agora RTC token so a browser can join a live stream's video channel — the Agora
// App Certificate (the actual secret) never leaves this function. Privacy and viewer-counting are both
// handled by the database function live_stream_join(): this function trusts whatever channel name that
// RPC hands back and never invents or checks one itself, so there is exactly one place that decides
// who is allowed into a given stream.
//
// { streamId } -> { token, channelName, appId, isHost }
//
// Deploy with "Verify JWT" switched OFF (the caller's login token is checked in the code below, same
// pattern as dynamic-handler / recover-account).
// Secrets needed: AGORA_APP_ID, AGORA_APP_CERTIFICATE (from the Agora console's "Default Project" ->
// Security -> Primary Certificate).
import { createClient } from 'npm:@supabase/supabase-js@2';
import AgoraToken from 'npm:agora-token@2.0.5';
const { RtcTokenBuilder, RtcRole } = AgoraToken as any;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Supabase provides keys under the classic name or (newer projects) inside a list.
function envKey(classic: string, listName: string): string {
  const direct = Deno.env.get(classic);
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get(listName) || '{}');
    return keys.default || (Object.values(keys)[0] as string) || '';
  } catch {
    return '';
  }
}
const publicKey = () => envKey('SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEYS');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const streamId = String(body?.streamId || '').trim();
  if (!streamId) return json({ error: 'Missing streamId.' }, 400);

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'Please log in.' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, publicKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  // The one place that decides "can this person watch/host this stream" — reused as-is, never
  // duplicated here. Also atomically counts the viewer.
  const { data, error } = await asUser.rpc('live_stream_join', { p_id: streamId });
  if (error || !data) return json({ error: error?.message || 'This stream is not available.' }, 403);

  const appId = Deno.env.get('AGORA_APP_ID');
  const appCertificate = Deno.env.get('AGORA_APP_CERTIFICATE');
  if (!appId || !appCertificate) return json({ error: 'Live streaming is not configured yet.' }, 500);

  const role = data.isHost ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expireSeconds = 3600; // the client asks for a fresh token again if a stream runs longer than this
  const rtcToken = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, data.channelName, 0, role, expireSeconds, expireSeconds);

  return json({ token: rtcToken, channelName: data.channelName, appId, isHost: !!data.isHost });
});
