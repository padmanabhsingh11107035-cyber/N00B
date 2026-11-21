
export function createClient(url, key, opts) {
  return {
    auth: {
      getUser: async (token) => globalThis.__fake.getUser(token),
      admin: {
        getUserById: async (id) => globalThis.__fake.getUserById(id),
        createUser: async (opts) => globalThis.__fake.createUser(opts),
        generateLink: async (opts) => globalThis.__fake.generateLink(opts)
      }
    },
    rpc: async (fn, args) => globalThis.__fake.rpc(fn, args),
    from: (table) => {
      const f = { table, eq: {} };
      const q = { select: () => q, eq: (k, v) => { f.eq[k] = v; return q; }, maybeSingle: async () => globalThis.__fake.select(f), insert: async (row) => globalThis.__fake.insert(table, row), update: (row) => ({ eq: async (k, v) => { globalThis.__fake.updates.push([table, row, k, v]); return { error: null }; } }) };
      return q;
    }
  };
}
