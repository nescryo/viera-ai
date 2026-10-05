/**
 * Groups items by calendar day relative to `now` (local time):
 * Today, Yesterday, Previous 7 days, Older. Empty groups are omitted and
 * the input order is preserved inside each group.
 */
export interface DateGroup<T> {
  label: string;
  items: T[];
}

const DAY_MS = 86_400_000;

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function groupByDay<T>(items: T[], getTime: (item: T) => number, now: number = Date.now()): DateGroup<T>[] {
  const today = startOfDay(now);
  const buckets: DateGroup<T>[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const item of items) {
    const day = startOfDay(getTime(item));
    const daysAgo = Math.round((today - day) / DAY_MS);
    // Future timestamps (clock skew) count as today
    const index = daysAgo <= 0 ? 0 : daysAgo === 1 ? 1 : daysAgo <= 7 ? 2 : 3;
    buckets[index].items.push(item);
  }

  return buckets.filter((b) => b.items.length > 0);
}
