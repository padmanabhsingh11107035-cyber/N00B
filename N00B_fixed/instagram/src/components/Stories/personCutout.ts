// "Remove background" for the Cutouts sticker: Google's MediaPipe selfie segmenter, run on the phone itself (nothing is sent anywhere). The program is the same one the
// Lenses camera uses (public/lenses/mediapipe); the model (public/lenses/selfie_segmenter.tflite, Apache 2.0, 250 KB) is fetched only when this is used.
// It cuts out PEOPLE (that is what the model knows); the person is placed on a transparent picture with a white sticker edge.

let pending: Promise<import('@mediapipe/tasks-vision').ImageSegmenter> | null = null;

async function segmenter(): Promise<import('@mediapipe/tasks-vision').ImageSegmenter> {
  if (!pending) {
    pending = (async () => {
      const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks('/lenses/mediapipe');
      const make = (delegate: 'GPU' | 'CPU') => ImageSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/lenses/selfie_segmenter.tflite', delegate },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false
      });
      try { return await make('GPU'); } catch { return make('CPU'); }
    })();
    pending.catch(() => { pending = null; });
  }
  return pending;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The picture could not be opened.')); };
    img.src = url;
  });
}

/** the person in the picture on a transparent background, with a white sticker edge; throws when nobody is found */
export async function personCutoutSticker(file: File): Promise<File> {
  const img = await loadImage(file);
  const MAX = 960;
  const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sctx = src.getContext('2d')!;
  sctx.drawImage(img, 0, 0, w, h);

  let seg;
  try { seg = await segmenter(); } catch { throw new Error('Removing the background does not work on this phone. Use a shape instead.'); }
  const result = seg.segment(src);
  const mask = result.confidenceMasks?.[0];
  if (!mask) throw new Error('No person found in this picture.');
  const mw = mask.width, mh = mask.height;
  const conf = mask.getAsFloat32Array();
  // some model files give the background in the first mask: the person is the side that is NOT the whole picture
  let sum = 0; for (let i = 0; i < conf.length; i += 7) sum += conf[i];
  const invert = sum / Math.ceil(conf.length / 7) > 0.8;

  // the mask as an alpha picture at the picture's size (smooth edge)
  const m = document.createElement('canvas'); m.width = mw; m.height = mh;
  const mctx = m.getContext('2d')!;
  const md = mctx.createImageData(mw, mh);
  let minX = mw, minY = mh, maxX = 0, maxY = 0, count = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    let a = conf[y * mw + x]; if (invert) a = 1 - a;
    a = Math.max(0, Math.min(1, (a - 0.35) / 0.3));   // soft threshold: a clean edge, no fuzz
    const i = (y * mw + x) * 4;
    md.data[i] = md.data[i + 1] = md.data[i + 2] = 255; md.data[i + 3] = Math.round(a * 255);
    if (a > 0.5) { count++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  try { result.close(); } catch { /* nothing to free */ }
  if (count < mw * mh * 0.01) throw new Error('No person found in this picture. Try a picture of a person.');
  mctx.putImageData(md, 0, 0);

  // the person: the picture where the mask says so
  const person = document.createElement('canvas'); person.width = w; person.height = h;
  const pctx = person.getContext('2d')!;
  pctx.drawImage(src, 0, 0);
  pctx.globalCompositeOperation = 'destination-in';
  pctx.imageSmoothingQuality = 'high';
  pctx.drawImage(m, 0, 0, w, h);

  // crop to the person, then draw a white edge around the shape (the same look as the shape cutouts)
  const sx = (minX / mw) * w, sy = (minY / mh) * h, sw = ((maxX - minX + 1) / mw) * w, sh = ((maxY - minY + 1) / mh) * h;
  const pad = 26, edge = 12;
  const out = document.createElement('canvas'); out.width = Math.round(sw + pad * 2); out.height = Math.round(sh + pad * 2);
  const octx = out.getContext('2d')!;
  // white edge: the person's outline drawn in white, shifted around in a ring, then the person on top
  const white = document.createElement('canvas'); white.width = person.width; white.height = person.height;
  const wctx = white.getContext('2d')!;
  wctx.drawImage(person, 0, 0);
  wctx.globalCompositeOperation = 'source-in'; wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, w, h);
  octx.shadowColor = 'rgba(0,0,0,0.35)'; octx.shadowBlur = 14; octx.shadowOffsetY = 4;
  for (let a = 0; a < 360; a += 20) {
    octx.drawImage(white, sx, sy, sw, sh, pad + Math.cos((a * Math.PI) / 180) * edge, pad + Math.sin((a * Math.PI) / 180) * edge, sw, sh);
  }
  octx.shadowColor = 'transparent';
  octx.drawImage(person, sx, sy, sw, sh, pad, pad, sw, sh);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(new File([b], 'person-cutout.png', { type: 'image/png' })) : reject(new Error('The sticker could not be made.'))), 'image/png'));
}
