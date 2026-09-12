import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// AWS SigV4 stamps the current time into every signed URL, so calling
// getSignedUrl again for the exact same object produces a different query
// string each time — which means the browser can never cache that video/
// image across repeat requests (e.g. every reel-feed refetch), even though
// the underlying file never changed. Reusing the same signed URL for a
// while fixes that: only re-sign once the cached one is close to expiring.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

function getCachedSignedUrl(key: string): string | null {
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  return null;
}

function setCachedSignedUrl(key: string, url: string, expiresInSeconds: number) {
  // Stop reusing a bit before the real expiry so an in-flight download
  // never gets cut off by the URL going stale mid-transfer.
  const safetyMarginMs = Math.min(5 * 60 * 1000, (expiresInSeconds * 1000) / 4);
  signedUrlCache.set(key, { url, expiresAt: Date.now() + expiresInSeconds * 1000 - safetyMarginMs });
}

// Backblaze B2 S3-Compatible Client Helper
// Strictly follows security rule: NO hardcoded keys or fallback secrets.
//
// Memoized: constructing an S3Client resolves its config/credential/retry
// middleware stack synchronously, which is real work on Node's single
// thread. This used to run on EVERY call — including calls that immediately
// bail out on a cache hit or a non-B2 value — which, multiplied across every
// avatar/media URL signed on a page like Reels (reels × 3 fields + every
// user's avatar + posts + stories, all in one burst), was a large chunk of
// a 20+ second load. The env vars this reads are static for the process's
// lifetime, so building the client once and reusing it is always correct.
let cachedB2Client: { client: S3Client | null; bucket: string; endpoint: string; isConfigured: boolean } | null = null;

export function getB2Client(): { client: S3Client | null; bucket: string; endpoint: string; isConfigured: boolean } {
  if (cachedB2Client) return cachedB2Client;

  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucketName = process.env.B2_BUCKET_NAME || 'noob-learning-media';
  const endpoint = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';

  if (!keyId || !applicationKey) {
    cachedB2Client = {
      client: null,
      bucket: bucketName,
      endpoint,
      isConfigured: false
    };
    return cachedB2Client;
  }

  const client = new S3Client({
    endpoint: endpoint,
    region: 'us-east-005',
    forcePathStyle: true,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: applicationKey
    }
  });

  cachedB2Client = {
    client,
    bucket: bucketName,
    endpoint,
    isConfigured: true
  };
  return cachedB2Client;
}

/**
 * Uploads a file buffer or stream directly to the private B2 Bucket.
 * Returns the stored short object key (e.g. "posts/1725000000-abcd.jpg").
 */
export async function uploadMediaToB2(
  fileBuffer: Buffer,
  folder: 'posts' | 'reels' | 'stories' | 'avatars' | 'music' | 'covers' | 'stickers',
  originalFilename: string,
  contentType: string
): Promise<{ objectKey: string; presignedUrl: string }> {
  const { client, bucket, isConfigured } = getB2Client();
  const fileExt = originalFilename.split('.').pop() || 'dat';
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const objectKey = `${folder}/${Date.now()}-${randomSuffix}.${fileExt}`;

  if (!isConfigured || !client) {
    // Without real B2 credentials there is no key to hand back — a short
    // "posts/169...-abcd.jpg"-shaped string would look valid but resolve to
    // nothing, silently breaking anything that persists objectKey instead of
    // presignedUrl (several upload flows prefer objectKey, since that's the
    // right choice once B2 IS configured — a stored key can be re-signed
    // forever, while a presigned URL expires in an hour). So in this
    // fallback, objectKey IS the data URI: whichever field a caller saves,
    // it's the same self-contained, always-resolvable value, and
    // signMediaKey already returns a "data:" string unchanged.
    const dataUri = `data:${contentType};base64,${fileBuffer.toString('base64')}`;
    return {
      objectKey: dataUri,
      presignedUrl: dataUri
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: fileBuffer,
    ContentType: contentType,
    // Objects are immutable (each upload gets a fresh, unique key), so once a
    // browser has fetched a given presigned URL it can keep reusing its own
    // cached copy for as long as that URL stays valid, instead of re-hitting
    // B2 (and burning a Class B download transaction) on every page reload.
    CacheControl: 'public, max-age=3300, immutable'
  });

  await client.send(command);

  // Generate an initial 1-hour presigned GET URL
  const presignedUrl = await signMediaKey(objectKey);

  return {
    objectKey,
    presignedUrl
  };
}

/**
 * Generates a fresh presigned GET URL (1-hour expiry) for an S3 object key.
 * If the input is already a full URL or data URI, it is safely returned as-is.
 */
export async function signMediaKey(keyOrUrl?: string | null, expiresInSeconds = 3600): Promise<string> {
  if (!keyOrUrl) return '';
  if (keyOrUrl.startsWith('data:')) return keyOrUrl;
  // A leading slash means this is already a resolvable local/static path
  // (e.g. the default "/noob-logo.svg.jpeg" avatar), not a B2 object key —
  // real upload keys are always "folder/filename", never slash-prefixed.
  // Checked before touching B2 at all: this is the single most common case
  // (every default avatar) and needs no client or cache lookup.
  if (keyOrUrl.startsWith('/')) return keyOrUrl;

  // A cached, still-fresh signed URL (see the module comment above) means no
  // B2 client is needed at all — check before constructing/fetching one.
  const cached = getCachedSignedUrl(keyOrUrl);
  if (cached) return cached;

  const { client, bucket, endpoint, isConfigured } = getB2Client();

  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    // Some avatars/stories/tracks were saved (before object keys were
    // persisted separately) with an already-signed, one-hour presigned URL
    // baked in as the stored value — once that hour passes the image just
    // breaks forever, because the real object key was never kept anywhere
    // else. The object key is still sitting right there in the URL's path
    // (a presigned GET URL is "<endpoint>/<bucket>/<key>?X-Amz-..."), so if
    // this URL points at our own bucket, pull the key back out and re-sign
    // it fresh instead of returning the stale signature unchanged.
    if (isConfigured && client && keyOrUrl.startsWith(`${endpoint}/${bucket}/`)) {
      const pathAndQuery = keyOrUrl.slice(`${endpoint}/${bucket}/`.length);
      const staleKey = decodeURIComponent(pathAndQuery.split('?')[0]);
      if (staleKey) {
        return signMediaKey(staleKey, expiresInSeconds);
      }
    }
    return keyOrUrl;
  }

  if (!isConfigured || !client) {
    // If not configured, return key or placeholder
    return keyOrUrl;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: keyOrUrl
    });

    const signed = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    setCachedSignedUrl(keyOrUrl, signed, expiresInSeconds);
    return signed;
  } catch (err) {
    console.error(`Failed to generate presigned URL for key "${keyOrUrl}":`, err);
    return keyOrUrl;
  }
}

/**
 * Permanently deletes an object from B2 given its stored key OR a
 * presigned URL pointing at it (the key is pulled out of the URL path the
 * same way signMediaKey does). Used for content whose media should not
 * outlive it — expired stories, deleted posts/reels. Never throws: a
 * cleanup pass calling this in a loop shouldn't die because one object
 * was already gone or B2 isn't configured.
 */
export async function deleteMediaFromB2(keyOrUrl?: string | null): Promise<void> {
  if (!keyOrUrl || keyOrUrl.startsWith('data:') || keyOrUrl.startsWith('/')) return;

  const { client, bucket, endpoint, isConfigured } = getB2Client();
  if (!isConfigured || !client) return;

  let key = keyOrUrl;
  if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
    if (!keyOrUrl.startsWith(`${endpoint}/${bucket}/`)) return; // not our bucket
    key = decodeURIComponent(keyOrUrl.slice(`${endpoint}/${bucket}/`.length).split('?')[0]);
  }
  if (!key) return;

  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    console.error(`Failed to delete B2 object "${key}":`, err);
  }
}
