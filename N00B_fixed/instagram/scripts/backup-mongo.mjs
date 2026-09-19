// Read-only backup of every collection this app persists to MongoDB.
// Never writes to, updates, or deletes anything in the database — it only
// runs find() and saves the results to local JSON files.
//
// Usage (PowerShell):
//   $env:MONGODB_URI = "<your connection string>"; node scripts/backup-mongo.mjs
//
// The connection string is read from the environment and is never printed.
import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Set it in your terminal first (see usage at the top of this file).');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.join('backups', stamp);
fs.mkdirSync(outDir, { recursive: true });

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20000 });
try {
  await client.connect();
  const db = client.db();
  const docs = await db.collection('app_state').find({}).toArray();

  if (docs.length === 0) {
    console.error('Connected, but the app_state collection is empty — nothing to back up. Check that this is the right database.');
    process.exit(2);
  }

  const combined = {};
  for (const doc of docs) {
    const key = String(doc._id);
    combined[key] = doc.data;
    fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(doc.data, null, 2));
    const count = Array.isArray(doc.data) ? `${doc.data.length} items` : 'object';
    console.log(`saved ${key}.json (${count})`);
  }
  fs.writeFileSync(path.join(outDir, '_all.json'), JSON.stringify(combined, null, 2));

  const users = combined.users;
  console.log('');
  console.log(`Done. Backup folder: ${outDir}`);
  if (Array.isArray(users)) console.log(`Users in backup: ${users.length}`);
} finally {
  await client.close();
}
