import { MongoClient, Db } from 'mongodb';

// MongoDB Atlas persistence layer.
// Strictly follows security rule: NO hardcoded connection strings or fallback secrets.
// Degrades gracefully (in-memory only, same as before) when MONGODB_URI is not set.

let client: MongoClient | null = null;
let db: Db | null = null;
let lastError: string | null = null;

const STATE_COLLECTION = 'app_state';

export async function connectDB(): Promise<boolean> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return false;

  try {
    // A generous serverSelectionTimeoutMS/socketTimeoutMS matters more here
    // than on a typical deployment — a free-tier instance with a fraction
    // of a CPU core, talking to a database in a different region, is slow
    // enough at both the network round-trip AND parsing the response that
    // the driver's normal defaults can trip under real (not just
    // pathological) conditions, silently dropping a load partway through.
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000, socketTimeoutMS: 45000 });
    await client.connect();
    // client.db() with no name uses whatever database the connection
    // string's path segment names — or MongoDB's own "test" database if it
    // has none. Logged explicitly so a wrong/missing database name in the
    // URI shows up immediately in the boot logs instead of silently
    // reading from (and writing to) the wrong place.
    db = client.db();
    await db.command({ ping: 1 });
    console.log(`MongoDB: connected to database "${db.databaseName}"`);
    lastError = null;
    return true;
  } catch (err: any) {
    lastError = err?.message || String(err);
    console.error('MongoDB connection failed:', lastError);
    db = null;
    return false;
  }
}

export function isDbConnected(): boolean {
  return !!db;
}

export function getDbStatusLabel(): 'connected' | 'not configured' | 'error' {
  if (db) return 'connected';
  if (!process.env.MONGODB_URI) return 'not configured';
  return 'error';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// A load returning null used to be treated as "this collection is
// genuinely empty" by every caller — indistinguishable from a transient
// timeout, which silently discarded that collection's real data on the
// very next state restore. Retrying here means a caller only ever sees
// null once every attempt has actually failed.
export async function loadCollection<T = any>(name: string, attempts = 3): Promise<T | null> {
  if (!db) return null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const doc = await db.collection(STATE_COLLECTION).findOne({ _id: name as any });
      return doc ? (doc.data as T) : null;
    } catch (err) {
      const isLastAttempt = attempt === attempts;
      console.error(`MongoDB load failed for "${name}" (attempt ${attempt}/${attempts}):`, err);
      if (isLastAttempt) return null;
      await sleep(500 * attempt);
    }
  }
  return null;
}

export async function saveCollection(name: string, data: any): Promise<void> {
  if (!db) return;
  try {
    await db.collection(STATE_COLLECTION).updateOne(
      { _id: name as any },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (err) {
    console.error(`MongoDB save failed for "${name}":`, err);
  }
}
