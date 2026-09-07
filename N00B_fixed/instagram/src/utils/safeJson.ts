/**
 * Safe JSON serialization utilities to prevent "Converting circular structure to JSON"
 * errors from DOM elements (like HTMLVideoElement), React FiberNodes, or circular references.
 */

export function safeJsonStringify(data: any, space?: number): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(
      data,
      (key, value) => {
        // Strip out React internal keys
        if (typeof key === 'string' && (key.startsWith('__react') || key.startsWith('_react'))) {
          return undefined;
        }

        // Handle DOM elements or Window objects
        if (typeof window !== 'undefined') {
          if (value instanceof HTMLElement || (typeof Node !== 'undefined' && value instanceof Node)) {
            return undefined;
          }
          if (value instanceof Window) {
            return undefined;
          }
          if (typeof Event !== 'undefined' && value instanceof Event) {
            return undefined;
          }
        }

        // Handle objects and circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return undefined;
          }
          seen.add(value);
        }

        return value;
      },
      space
    );
  } catch (err) {
    console.warn('safeJsonStringify encountered serialization error, returning empty JSON:', err);
    return '{}';
  }
}

export function safeJsonParse<T = any>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str);
  } catch (err) {
    return fallback;
  }
}
