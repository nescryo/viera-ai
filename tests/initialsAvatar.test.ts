import { describe, it, expect } from 'vitest';
import { getInitials, colorForName, createInitialsAvatar } from '../src/services/initialsAvatar';

describe('getInitials', () => {
  it('uses the first letters of the first and last word', () => {
    expect(getInitials('Klein Moretti')).toBe('KM');
    expect(getInitials('ana maria de souza')).toBe('AS');
  });

  it('uses one letter for a single word', () => {
    expect(getInitials('Klein')).toBe('K');
  });

  it('ignores a leading @ and separators', () => {
    expect(getInitials('@nescryo')).toBe('N');
    expect(getInitials('john_doe')).toBe('JD');
  });

  it('handles non-Latin letters', () => {
    expect(getInitials('流云 景')).toBe('流景');
  });

  it('falls back to "?" without letters', () => {
    expect(getInitials('')).toBe('?');
    expect(getInitials('   ')).toBe('?');
    expect(getInitials('!!!')).toBe('?');
  });
});

describe('colorForName', () => {
  it('is stable and ignores case and surrounding spaces', () => {
    expect(colorForName('Klein')).toBe(colorForName(' klein '));
  });
});

describe('createInitialsAvatar', () => {
  it('returns an SVG data URL containing the initials', () => {
    const url = createInitialsAvatar('Klein Moretti');
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(url)).toContain('>KM</text>');
  });

  it('escapes characters that would break the SVG', () => {
    const svg = decodeURIComponent(createInitialsAvatar('<b> &'));
    expect(svg).not.toContain('<b>');
  });
});
