import type { ProjectionPoint } from './types';
export type ZoomPreset = '1h' | '5h' | '24h' | 'all';
export type TimeWindow = [number, number];
export function orderedPoints(points: ProjectionPoint[], projection: boolean): ProjectionPoint[] {
  return points.filter(p => Number.isFinite(p.timestamp) && Number.isFinite(p.usedPercent) && (projection || !p.projected))
    .sort((a, b) => a.timestamp - b.timestamp);
}
export function timeWindow(points: ProjectionPoint[], preset: ZoomPreset, manual: TimeWindow | null): TimeWindow {
  if (!points.length) return [0, 1];
  const first = points[0].timestamp, last = points[points.length - 1].timestamp;
  if (manual) {
    const start = Math.max(first, Math.min(manual[0], last));
    const end = Math.max(start, Math.min(manual[1], last));
    return [start, Math.max(start + 1, end)];
  }
  if (preset === 'all') return [first, Math.max(first + 1, last)];
  // Recent shortcuts are anchored to the last OBSERVED sample, never a future projection.
  const end = [...points].reverse().find(p => !p.projected)?.timestamp ?? last;
  const seconds = { '1h': 3600, '5h': 18000, '24h': 86400 }[preset];
  return [Math.max(first, end - seconds), Math.max(first + 1, end)];
}
export function brushIndices(points: ProjectionPoint[], window: TimeWindow): [number, number] {
  let start = points.findIndex(p => p.timestamp >= window[0]);
  if (start < 0) start = Math.max(0, points.length - 1);
  let end = points.length - 1;
  while (end > start && points[end].timestamp > window[1]) end--;
  return [start, Math.max(start, end)];
}
