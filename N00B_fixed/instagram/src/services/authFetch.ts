// The login library (supabase auth) DELETES the saved login when renewing it fails with an answer it does not consider
// temporary. It treats server errors (500-504, Cloudflare 52x) and lost connections as temporary and keeps the login,
// but a "too many requests" answer (HTTP 429) is not on its list, so one rate-limited renewal signed the person out even
// though nothing was wrong with them or their account.
//
// "Too many requests" is temporary by definition. This wrapper relabels it, for the renewal request ONLY, as 503
// ("service unavailable") so the library keeps the login and tries again a moment later. A genuine "this login is no
// longer valid" answer (400/401: refresh token not found / already used / session expired) is passed through untouched,
// and so are sign-in attempts (a 429 while typing a password is still reported as "too many attempts").

type FetchLike = (input: any, init?: any) => Promise<Response>;

const isTokenRenewal = (input: any): boolean => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input?.url ?? '');
  return url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');
};

export function makePatientFetch(base: FetchLike): FetchLike {
  return async (input, init) => {
    const res = await base(input, init);
    if (res.status === 429 && isTokenRenewal(input)) {
      return new Response(res.body, { status: 503, statusText: 'Service Unavailable', headers: res.headers });
    }
    return res;
  };
}
