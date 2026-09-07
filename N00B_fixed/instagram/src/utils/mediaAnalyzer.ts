/**
 * Automated MIME-type & Media Format Analyzer
 * Inspects files, Blobs, data URLs, and URLs to guarantee strict routing:
 * - Images -> automatically routed to Feed
 * - Videos -> automatically routed to Reels
 * - Audio -> automatically routed to Music Hub
 */

export interface MediaAnalysisResult {
  mediaType: 'image' | 'video' | 'audio' | 'unknown';
  mimeType: string;
  destination: 'feed' | 'reels' | 'music' | 'unsupported';
  isValid: boolean;
  fileSize?: number;
  fileName?: string;
  error?: string;
}

const SUPPORTED_IMAGE_MIMES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'image/bmp',
  'image/avif'
];

const SUPPORTED_VIDEO_MIMES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/ogg',
  'video/3gpp'
];

const SUPPORTED_AUDIO_MIMES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/aac',
  'audio/webm',
  'audio/flac'
];

/**
 * Analyzes a browser File or Blob object
 */
export function analyzeMediaFile(file: File | Blob, customFileName?: string): MediaAnalysisResult {
  const name = customFileName || (file instanceof File ? file.name : 'media_file');
  const rawType = (file.type || '').toLowerCase().trim();
  const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';

  // 1. Check direct MIME type
  if (rawType.startsWith('video/') || SUPPORTED_VIDEO_MIMES.includes(rawType) || ['mp4', 'mov', 'webm', 'mkv', 'm4v'].includes(extension)) {
    return {
      mediaType: 'video',
      mimeType: rawType || `video/${extension || 'mp4'}`,
      destination: 'reels',
      isValid: true,
      fileSize: file.size,
      fileName: name
    };
  }

  if (rawType.startsWith('image/') || SUPPORTED_IMAGE_MIMES.includes(rawType) || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(extension)) {
    return {
      mediaType: 'image',
      mimeType: rawType || `image/${extension || 'jpeg'}`,
      destination: 'feed',
      isValid: true,
      fileSize: file.size,
      fileName: name
    };
  }

  if (rawType.startsWith('audio/') || SUPPORTED_AUDIO_MIMES.includes(rawType) || ['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(extension)) {
    return {
      mediaType: 'audio',
      mimeType: rawType || `audio/${extension || 'mpeg'}`,
      destination: 'music',
      isValid: true,
      fileSize: file.size,
      fileName: name
    };
  }

  return {
    mediaType: 'unknown',
    mimeType: rawType || 'application/octet-stream',
    destination: 'unsupported',
    isValid: false,
    fileSize: file.size,
    fileName: name,
    error: `Unsupported file format (${extension || rawType || 'unknown'}). Please select an image, video, or audio file.`
  };
}

/**
 * Analyzes a URL or Data URI string
 */
export function analyzeMediaUrl(url: string): MediaAnalysisResult {
  if (!url || typeof url !== 'string') {
    return {
      mediaType: 'unknown',
      mimeType: 'unknown',
      destination: 'unsupported',
      isValid: false,
      error: 'Empty or invalid URL provided.'
    };
  }

  const cleanUrl = url.trim().toLowerCase();

  // Data URI inspection
  if (cleanUrl.startsWith('data:')) {
    const mimeMatch = cleanUrl.match(/^data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : '';

    if (mime.startsWith('video/')) {
      return { mediaType: 'video', mimeType: mime, destination: 'reels', isValid: true };
    }
    if (mime.startsWith('image/')) {
      return { mediaType: 'image', mimeType: mime, destination: 'feed', isValid: true };
    }
    if (mime.startsWith('audio/')) {
      return { mediaType: 'audio', mimeType: mime, destination: 'music', isValid: true };
    }
  }

  // File extension in URL path inspection
  const pathWithoutQuery = cleanUrl.split('?')[0].split('#')[0];

  if (/\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(pathWithoutQuery) || cleanUrl.includes('/reels/') || cleanUrl.includes('video')) {
    return {
      mediaType: 'video',
      mimeType: 'video/mp4',
      destination: 'reels',
      isValid: true
    };
  }

  if (/\.(jpg|jpeg|png|webp|gif|svg|avif|bmp)$/i.test(pathWithoutQuery) || cleanUrl.includes('images.unsplash.com') || cleanUrl.includes('/posts/') || cleanUrl.includes('/avatars/')) {
    return {
      mediaType: 'image',
      mimeType: 'image/jpeg',
      destination: 'feed',
      isValid: true
    };
  }

  if (/\.(mp3|wav|ogg|aac|flac)$/i.test(pathWithoutQuery) || cleanUrl.includes('/music/')) {
    return {
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      destination: 'music',
      isValid: true
    };
  }

  // Default fallback to image feed
  return {
    mediaType: 'image',
    mimeType: 'image/jpeg',
    destination: 'feed',
    isValid: true
  };
}
