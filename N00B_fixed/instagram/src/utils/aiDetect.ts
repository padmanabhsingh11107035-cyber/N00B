// Finds the standard "made by AI" markers that AI tools write INSIDE a picture or video file, so a post can carry an "AI info" label without the person having to say so.
//
// What it looks for (the same open standards that other apps read):
//   * IPTC "digital source type" = trainedAlgorithmicMedia / compositeWithTrainedAlgorithmicMedia / algorithmicMedia (written by Google, Adobe, Microsoft, OpenAI and others),
//   * C2PA "Content Credentials" that name an AI tool or the AI digital source type,
//   * the name of a well-known generator in the file's own tags (Midjourney, DALL-E, Stable Diffusion, Firefly ...), and the settings text that Stable Diffusion tools write into PNGs.
// What it can NOT do, and the app never claims: an AI picture whose tags were stripped (a screenshot, a picture sent through a messenger or saved by a social site) carries nothing to read.
// So this only ever ADDS a label; the person can always label their own post by hand too. It runs on this phone, on the ORIGINAL file (the upload makes the file smaller and drops its tags),
// and reads only the first part of the file (and the last part of a video); nothing is sent anywhere.

export interface AiSignal { reason: string }

const HEAD_BYTES = 1024 * 1024;
const TAIL_BYTES = 512 * 1024;

/** Looks for the markers in the text of a file's bytes (read as latin1, so every byte is a character). */
export function detectAiSignals(text: string): AiSignal | null {
  if (!text) return null;
  if (/trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|digitalsourcetype\/algorithmicMedia/i.test(text)) {
    return { reason: 'The file says it was made with AI (IPTC digital source type).' };
  }
  const hasC2pa = /c2pa|jumb|contentauth/i.test(text);
  if (hasC2pa && /(Adobe Firefly|Firefly|DALL[·\-. ]?E|OpenAI|Midjourney|Imagen|Google Gemini|Gemini|Stable Diffusion|Bing Image Creator|Copilot Designer|Sora|Ideogram|Leonardo)/i.test(text)) {
    return { reason: 'The file has Content Credentials (C2PA) that name an AI tool.' };
  }
  if (/\b(Midjourney|DALL[·\-. ]?E ?[23]?|Stable ?Diffusion|Adobe Firefly|Leonardo\.Ai|NovelAI|ComfyUI|InvokeAI)\b/i.test(text)) {
    return { reason: 'The file names an AI image tool.' };
  }
  if (/Steps: \d+, Sampler: [A-Za-z0-9 ++]+/.test(text) && /(CFG scale|Seed: \d+)/.test(text)) {
    return { reason: 'The file holds the settings of an AI image tool.' };
  }
  return null;
}

const asText = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  return out;
};

/** Reads the start (and, for a video, the end) of the original file and looks for AI markers. Never throws: a file that cannot be read simply has no label. */
export async function detectAiMedia(file: Blob): Promise<AiSignal | null> {
  try {
    const type = (file as File).type || '';
    if (!/^image\/|^video\//.test(type)) return null;
    const head = asText(await file.slice(0, HEAD_BYTES).arrayBuffer());
    const found = detectAiSignals(head);
    if (found) return found;
    if (type.startsWith('video/') && file.size > HEAD_BYTES) {
      return detectAiSignals(asText(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer()));
    }
    return null;
  } catch {
    return null;
  }
}
