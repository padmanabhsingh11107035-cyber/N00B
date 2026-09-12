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

/**
 * Writes to localStorage without ever throwing. A full quota (easy to hit
 * once chat history/media accumulates) throws QuotaExceededError — and if
 * that happens inside a React state updater function, a try/catch wrapped
 * around the setState call that triggered it does NOT catch it, since React
 * invokes updater functions outside that original call stack. Left
 * unguarded, this crashed straight through to the nearest ErrorBoundary on
 * every future write once the quota was hit — e.g. every single chat
 * message sent afterward. The cache is just a speed-up; losing one write
 * should never take down the app.
 */
export function safeLocalStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`safeLocalStorageSet failed for key "${key}":`, err);
  }
}
