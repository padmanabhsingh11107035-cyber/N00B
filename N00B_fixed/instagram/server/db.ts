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

// Throws once every retry has failed, rather than swallowing the error and
// returning null — null here means "this document genuinely doesn't
// exist", a legitimately empty collection that's safe to persist as-is.
// A caller needs to be able to tell that apart from "the read itself
// failed", since treating a failed read as confirmed-empty is exactly what
// let a transient timeout silently discard real persisted data the moment
// something next saved that same (wrongly empty) collection back.
export async function loadCollection<T = any>(name: string, attempts = 3): Promise<T | null> {
  if (!db) return null;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const doc = await db.collection(STATE_COLLECTION).findOne({ _id: name as any });
      return doc ? (doc.data as T) : null;
    } catch (err) {
      lastErr = err;
      console.error(`MongoDB load failed for "${name}" (attempt ${attempt}/${attempts}):`, err);
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw lastErr;
}

// Retries with backoff and THROWS after exhausting them, same reasoning as
// loadCollection — this used to swallow every failure (catch, log, return
// normally either way), which meant persistImmediately's caller had no way
// to tell a real write from a silently-dropped one. A signup, post, reel or
// story could get told "success" and even be awaited through
// persistImmediately, while the actual MongoDB write had failed underneath
// it — most dangerously in the few seconds around a deploy cutover, when a
// process's DB connection can go away mid-write. That in-memory-only data
// then vanishes the moment that process exits, with nothing to show it was
// ever supposed to be saved.
export async function saveCollection(name: string, data: any, attempts = 3): Promise<void> {
  if (!db) return;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await db.collection(STATE_COLLECTION).updateOne(
        { _id: name as any },
        { $set: { data, updatedAt: new Date() } },
        { upsert: true }
      );
      return;
    } catch (err) {
      lastErr = err;
      console.error(`MongoDB save failed for "${name}" (attempt ${attempt}/${attempts}):`, err);
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw lastErr;
}
