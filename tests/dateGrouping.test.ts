import { describe, it, expect } from 'vitest';
import { groupByDay } from '../src/services/dateGrouping';

// Local noon, so DST shifts never move an item to another day
const NOW = new Date(2026, 9, 5, 12, 0, 0).getTime();
const at = (daysAgo: number, hour = 12) => new Date(2026, 9, 5 - daysAgo, hour, 0, 0).getTime();

describe('groupByDay', () => {
  it('buckets by calendar day, not by 24h windows', () => {
    const items = [
      { id: 'a', t: at(0, 0) },   // today, just after midnight
      { id: 'b', t: at(1, 23) },  // yesterday late night (< 24h ago)
      { id: 'c', t: at(2) },
      { id: 'd', t: at(7) },
      { id: 'e', t: at(8) },
    ];
    const groups = groupByDay(items, (i) => i.t, NOW);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c', 'd']],
      ['Older', ['e']],
    ]);
  });

  it('omits empty groups and keeps input order', () => {
    const items = [{ id: 'x', t: at(30) }, { id: 'y', t: at(10) }];
    const groups = groupByDay(items, (i) => i.t, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.id)).toEqual(['x', 'y']);
  });

  it('treats future timestamps as today', () => {
    const groups = groupByDay([{ t: NOW + 3_600_000 }], (i) => i.t, NOW);
    expect(groups[0].label).toBe('Today');
  });

  it('returns no groups for an empty list', () => {
    expect(groupByDay([], () => 0, NOW)).toEqual([]);
  });
});
