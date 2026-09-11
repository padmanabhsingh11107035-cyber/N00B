import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Backblaze B2 S3-Compatible Client Helper
// Strictly follows security rule: NO hardcoded keys or fallback secrets.
export function getB2Client(): { client: S3Client | null; bucket: string; endpoint: string; isConfigured: boolean } {
  const keyId = process.env.B2_KEY_ID;
  const applicationKey = process.env.B2_APPLICATION_KEY;
  const bucketName = process.env.B2_BUCKET_NAME || 'noob-learning-media';
  const endpoint = process.env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com';

  if (!keyId || !applicationKey) {
    return {
      client: null,
      bucket: bucketName,
      endpoint,
      isConfigured: false
    };
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

  return {
    client,
    bucket: bucketName,
    endpoint,
    isConfigured: true
  };
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
    ContentType: contentType
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
  // A leading slash means this is already a resolvable local/static path
  // (e.g. the default "/noob-logo.svg.jpeg" avatar), not a B2 object key —
  // real upload keys are always "folder/filename", never slash-prefixed.
  if (keyOrUrl.startsWith('/')) {
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

    return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    console.error(`Failed to generate presigned URL for key "${keyOrUrl}":`, err);
    return keyOrUrl;
  }
}
