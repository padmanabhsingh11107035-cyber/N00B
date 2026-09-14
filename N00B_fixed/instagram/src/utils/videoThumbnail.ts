// Grabs a real frame out of an uploaded video file to use as its thumbnail,
// instead of leaving reels with no thumbnail at all (which used to fall back
// to the same generic stock photo everywhere a reel thumbnail is shown,
// making every reel in Explore/Profile grids look identical).
export function captureVideoThumbnail(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.onloadedmetadata = () => {
      // A hair past 0 avoids a solid-black first frame on videos that fade
      // in, while staying well within even a very short clip's duration.
      const seekTo = Math.min(0.3, Math.max(0, (video.duration || 1) / 10));
      video.currentTime = seekTo;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) return resolve(null);
            resolve(new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.85
        );
      } catch {
        fail();
      }
    };

    video.onerror = fail;
    // Some browsers need an explicit load()/play() nudge before seeking
    // reliably fires `seeked` on a freshly created, off-DOM video element.
    video.load();
  });
}
