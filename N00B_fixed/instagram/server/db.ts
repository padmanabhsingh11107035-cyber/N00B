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
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
    await client.connect();
    db = client.db();
    await db.command({ ping: 1 });
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

export async function loadCollection<T = any>(name: string): Promise<T | null> {
  if (!db) return null;
  try {
    const doc = await db.collection(STATE_COLLECTION).findOne({ _id: name as any });
    return doc ? (doc.data as T) : null;
  } catch (err) {
    console.error(`MongoDB load failed for "${name}":`, err);
    return null;
  }
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
