import { SOURCE_FETCH_LIMIT } from "@/lib/config";
import type { FeedItem } from "@/lib/feed";

export function candidateLimit(perSource: number): number {
  return Math.min(SOURCE_FETCH_LIMIT, Math.max(30, perSource * 3));
}

/** Three affinity slots and two discovery slots per five, independently per source.
 * Reserve discovery before selecting affinity, so highly ranked matches cannot
 * consume the independent discovery selection. Weak matches keep the base order.
 */
export function personalizePapers(items: FeedItem[], scores: Readonly<Record<string, number>>): FeedItem[] {
  const bySource = new Map<string, FeedItem[]>();
  for (const item of items) {
    const list = bySource.get(item.source) ?? [];
    list.push(item);
    bySource.set(item.source, list);
  }
  const orders = new Map<string, FeedItem[]>();
  for (const [source, list] of bySource) {
    const remaining = [...list];
    const result: FeedItem[] = [];
    while (remaining.length) {
      const size = Math.min(5, remaining.length);
      const affinityCount = Math.floor(size * 0.6);
      const discovery = remaining.splice(0, size - affinityCount);
      const ranked = [...remaining].sort((a, b) => (scores[b.key] ?? 0) - (scores[a.key] ?? 0));
      const affinity = ranked.filter((item) => (scores[item.key] ?? 0) >= 0.65).slice(0, affinityCount);
      for (const item of affinity) remaining.splice(remaining.indexOf(item), 1);
      while (affinity.length < affinityCount && remaining.length) affinity.push(remaining.shift()!);
      result.push(...affinity, ...discovery);
    }
    // If no confident signal exists, don't shuffle the ordinary feed.
    orders.set(source, list.some((item) => (scores[item.key] ?? 0) >= 0.65) ? result : list);
  }
  const indices = new Map<string, number>();
  return items.map((item) => {
    const index = indices.get(item.source) ?? 0;
    indices.set(item.source, index + 1);
    return orders.get(item.source)![index];
  });
}
