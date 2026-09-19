// Pure helpers for finding and replacing oversized inline (base64) images.
// Kept free of any server state so the exact-match/replace behavior can be
// tested on its own — see the callers in server.ts for why this matters.

// Below this size an inline image costs less than the extra B2 round-trip
// would, so it's left alone.
export const INLINE_IMAGE_MIN_CHARS = 30_000;

export function isBigInlineImage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= INLINE_IMAGE_MIN_CHARS &&
    value.startsWith('data:image/')
  );
}

export function parseInlineImage(value: string): { mime: string; buffer: Buffer; extension: string } | null {
  const header = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(value.slice(0, 100));
  if (!header) return null;
  const mime = header[1].toLowerCase();
  const buffer = Buffer.from(value.slice(header[0].length), 'base64');
  if (buffer.length === 0) return null;
  const subtype = mime.split('/')[1].split('+')[0].replace(/[^a-z0-9]/g, '') || 'img';
  return { mime, buffer, extension: subtype === 'jpeg' ? 'jpg' : subtype };
}

// Walks any nested object/array and replaces every string value that is
// EXACTLY one of the map's keys. Exact matching is what makes this safe: a
// value the user changed in the meantime simply doesn't match and is left
// untouched. Returns whether anything was replaced.
export function replaceStringsDeep(root: unknown, replacements: Map<string, string>): boolean {
  let changed = false;
  const visit = (node: any) => {
    const keys: Array<string | number> = Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
    for (const k of keys) {
      const v = node[k];
      if (typeof v === 'string') {
        if (v.length >= INLINE_IMAGE_MIN_CHARS) {
          const replacement = replacements.get(v);
          if (replacement !== undefined) {
            node[k] = replacement;
            changed = true;
          }
        }
      } else if (v && typeof v === 'object') {
        visit(v);
      }
    }
  };
  if (root && typeof root === 'object') visit(root);
  return changed;
}
