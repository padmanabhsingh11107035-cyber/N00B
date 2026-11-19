// Looks at the ADMIN console on this computer with made-up data (nothing real is touched): starts the pretend backend as an admin, then the website against it.
//   node scripts/dev/admin-preview.mjs   ->  http://127.0.0.1:5173  (log in with any User ID and password)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = { ...process.env, MOCK_ADMIN: '1', VITE_SUPABASE_URL: 'http://127.0.0.1:54399', VITE_SUPABASE_PUBLISHABLE_KEY: 'mock' };
spawn(process.execPath, [path.join(root, 'scripts/dev/mock-backend.mjs')], { stdio: 'inherit', env, cwd: root });
spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--port', '5173', '--host', '127.0.0.1'], { stdio: 'inherit', env, cwd: root });
