// Local, self-contained avatars (inline SVG data URIs) — no stock photos, no network requests.
// Computer opponents get a plain robot badge in their seat colour; anyone without a profile
// picture gets their initial.

const COLOR_HEX: Record<string, string> = {
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  purple: '#9333ea',
  orange: '#ea580c',
};

const toDataUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export const computerAvatar = (color: string): string =>
  toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${
      COLOR_HEX[color] || '#475569'
    }"/><rect x="16" y="22" width="32" height="26" rx="6" fill="#fff"/><rect x="30" y="12" width="4" height="10" fill="#fff"/><circle cx="32" cy="11" r="3" fill="#fff"/><circle cx="25" cy="34" r="4" fill="#0f172a"/><circle cx="39" cy="34" r="4" fill="#0f172a"/><rect x="25" y="42" width="14" height="3" rx="1.5" fill="#0f172a"/></svg>`
  );

export const initialAvatar = (name: string, color = '#475569'): string => {
  const letter = (name.trim()[0] || '?').toUpperCase().replace(/[<>&"']/g, '?');
  return toDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${
      COLOR_HEX[color] || color
    }"/><text x="32" y="43" font-family="Arial,sans-serif" font-size="32" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text></svg>`
  );
};
