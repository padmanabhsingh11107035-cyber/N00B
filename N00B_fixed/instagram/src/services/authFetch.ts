// The login library (supabase auth) DELETES the saved login when renewing it fails with an answer it does not consider
// temporary. It treats lost connections and server errors (500-504, Cloudflare 52x) as temporary and keeps the login,
// but two more ordinary situations are NOT on its list, so a single one of them signed the person out even though
// nothing was wrong with them or their account:
//   * "too many requests" (HTTP 429), and
//   * any answer that is not the login server's own JSON (for example an HTML error page from something in between).
//
// This wrapper relabels both, for the renewal request ONLY, as 503 ("service unavailable") so the library keeps the
// login and tries again a moment later. A genuine "this login is no longer valid" answer comes from the login server as
// JSON (400/401: refresh token not found / already used / session expired) and is passed through untouched, and so are
// sign-in attempts (a 429 while typing a password is still reported as "too many attempts").

type FetchLike = (input: any, init?: any) => Promise<Response>;

export interface RenewalProblem {
  status: number;
  code?: string; // the login server's own reason, when it gave one (e.g. "session_not_found")
  temporary: boolean; // true: the login is kept and renewal is retried
}

const isTokenRenewal = (input: any): boolean => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url ?? '');
  return url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');
};

// The login server names its reason in a few ways depending on its version.
export function reasonCode(body: any): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  if (typeof body.error_code === 'string') return body.error_code;
  const text = `${body.error_description ?? ''} ${body.msg ?? ''} ${body.message ?? ''}`.toLowerCase();
  if (text.includes('already used')) return 'refresh_token_already_used';
  if (text.includes('refresh token not found')) return 'refresh_token_not_found';
  return typeof body.error === 'string' ? body.error : typeof body.code === 'string' ? body.code : undefined;
}

export function makePatientFetch(base: FetchLike, onProblem?: (p: RenewalProblem) => void): FetchLike {
  return async (input, init) => {
    const res = await base(input, init);
    if (res.ok || !isTokenRenewal(input)) return res;

    const isJson = /json/i.test(res.headers.get('content-type') || '');
    const temporary = res.status === 429 || (!isJson && res.status >= 400);

    let code: string | undefined;
    try {
      code = reasonCode(await res.clone().json());
    } catch {
      // not JSON: no code to report
    }
    try {
      onProblem?.({ status: res.status, code, temporary });
    } catch {
      // a broken recorder must never break the login
    }

    if (temporary) return new Response(res.body, { status: 503, statusText: 'Service Unavailable', headers: res.headers });
    return res;
  };
}
