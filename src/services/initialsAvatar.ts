/**
 * Default avatars made from the user's initials, rendered as an inline SVG
 * data URL so they work offline and need no external service.
 */

// Dark theme-friendly backgrounds; white text on each is at least 4.5:1
const AVATAR_COLORS = ['#4338ca', '#6d28d9', '#1d4ed8', '#0e7490', '#be185d', '#047857', '#b45309'];

/**
 * Up to two initials: first letters of the first and last word, or the
 * first letter of a single word. Leading "@" and punctuation are ignored.
 * Returns "?" when the name has no letters or digits.
 */
export function getInitials(name: string): string {
  const words = name
    .replace(/^@+/, '')
    .split(/[\s_.-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (words.length === 0) return '?';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toUpperCase();
}

/** Stable color for a name, so the same person always gets the same color. */
export function colorForName(name: string): string {
  let hash = 0;
  for (const ch of name.trim().toLowerCase()) {
    hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const escapeXml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** Square SVG avatar with the initials of `name`, as a data URL. */
export function createInitialsAvatar(name: string): string {
  const initials = escapeXml(getInitials(name));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">` +
    `<rect width="256" height="256" fill="${colorForName(name)}"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" fill="#ffffff" ` +
    `font-family="Inter, system-ui, sans-serif" font-size="${initials.length > 1 ? 100 : 116}" font-weight="600">` +
    `${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
