// The only piece that talks to a real Supabase project. Deliberately thin:
// all the logic lives in run-import.mjs, which is tested against a local
// Postgres. Uses the service-role key, which must come from the environment
// (typed into your own terminal) — it is never printed or stored.
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function makeSupabaseAdapter(url, serviceRoleKey) {
  const sb = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const fail = (what, error) => { throw new Error(`${what}: ${error.message || error}`); };
  return {
    async createAuthUser(u) {
      const create = (password) => sb.auth.admin.createUser({
        id: u.id, email: u.email, password, email_confirm: true, user_metadata: u.user_metadata
      });
      let { error } = await create(u.password);
      if (!error) return 'created';
      if (error.code === 'email_exists' || error.code === 'user_already_exists' || /already (been )?registered|already exists/i.test(error.message)) return 'exists';
      // The project's password rules (e.g. minimum length) refuse this old password.
      // Never guess or weaken it: give the account a random one and report it, so
      // the person sets a new password through the recovery flow.
      if (error.code === 'weak_password' || (/password/i.test(error.message) && /(at least|weak|short|length|character)/i.test(error.message))) {
        ({ error } = await create(crypto.randomBytes(18).toString('base64url')));
        if (!error) return 'created_temp_password';
      }
      return fail(`creating login account ${u.user_metadata?.username}`, error);
    },
    async authUserCount() {
      let total = 0;
      for (let page = 1; ; page++) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
        if (error) fail('listing login accounts', error);
        total += data.users.length;
        if (data.users.length < 200) return total;
      }
    },
    async count(table) {
      const { count, error } = await sb.from(table).select('*', { count: 'exact', head: true });
      if (error) fail(`counting ${table}`, error);
      return count ?? 0;
    },
    async insertMissing(table, rows, conflict, { overwrite }) {
      const { error } = await sb.from(table).upsert(rows, { onConflict: conflict, ignoreDuplicates: !overwrite });
      if (error) fail(`writing ${table}`, error);
    },
    async profileCounters() {
      const { data, error } = await sb.from('profiles').select('id, username, followers_count, following_count, posts_count');
      if (error) fail('reading profile counters', error);
      return data;
    }
  };
}
