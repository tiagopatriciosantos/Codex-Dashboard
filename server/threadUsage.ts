import type { RateLimitWindow } from './types.js';

export interface ThreadTaskRun {
  threadId: string;
  startedAt: number;
  completedAt: number;
}

export interface ThreadUsageAccumulator {
  percent: number;
  sampleIntervals: number;
  resetSegments: number;
}

interface TaskBracket {
  threadId: string;
  startIndex: number;
  endIndex: number;
  run: ThreadTaskRun;
}

interface BracketGroup {
  startIndex: number;
  endIndex: number;
  brackets: TaskBracket[];
}

function findSnapshotAtOrBefore(history: RateLimitWindow[], timestamp: number): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].observedAt <= timestamp) return index;
  }
  return -1;
}

function findSnapshotAtOrAfter(history: RateLimitWindow[], timestamp: number): number {
  return history.findIndex((point) => point.observedAt >= timestamp);
}

function mergeOverlappingBrackets(brackets: TaskBracket[]): BracketGroup[] {
  const ordered = [...brackets].sort(
    (a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex
  );
  const groups: BracketGroup[] = [];

  for (const bracket of ordered) {
    const current = groups.at(-1);
    if (!current || bracket.startIndex >= current.endIndex) {
      groups.push({
        startIndex: bracket.startIndex,
        endIndex: bracket.endIndex,
        brackets: [bracket]
      });
      continue;
    }

    current.endIndex = Math.max(current.endIndex, bracket.endIndex);
    current.brackets.push(bracket);
  }
  return groups;
}

function normalizeHistory(rawHistory: RateLimitWindow[]): RateLimitWindow[] {
  const ordered = [...rawHistory]
    .sort((a, b) => a.observedAt - b.observedAt)
    .filter((point) => Number.isFinite(point.observedAt) && Number.isFinite(point.usedPercent));
  const deduped: RateLimitWindow[] = [];
  for (const point of ordered) {
    const previous = deduped.at(-1);
    if (previous?.observedAt === point.observedAt) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }
  return deduped;
}

function splitAtResets(history: RateLimitWindow[]): RateLimitWindow[][] {
  const segments: RateLimitWindow[][] = [];
  for (const point of history) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    const resetBoundary = previous && (
      point.resetsAt !== previous.resetsAt ||
      point.usedPercent < previous.usedPercent - 0.01
    );
    if (!current || resetBoundary) segments.push([point]);
    else current.push(point);
  }
  return segments;
}

function estimateContinuousSegment(
  history: RateLimitWindow[],
  taskRuns: ThreadTaskRun[]
): Map<string, ThreadUsageAccumulator> {
  if (history.length < 2 || taskRuns.length === 0) return new Map();

  const brackets: TaskBracket[] = [];
  for (const run of taskRuns) {
    const startIndex = findSnapshotAtOrBefore(history, run.startedAt);
    const endIndex = findSnapshotAtOrAfter(history, run.completedAt);
    if (endIndex <= startIndex) continue;
    brackets.push({ threadId: run.threadId, startIndex, endIndex, run });
  }

  const result = new Map<string, ThreadUsageAccumulator>();
  for (const group of mergeOverlappingBrackets(brackets)) {
    let consistent = true;
    for (let index = group.startIndex + 1; index <= group.endIndex; index += 1) {
      const delta = history[index].usedPercent - history[index - 1].usedPercent;
      if (delta < -0.01) {
        consistent = false;
        break;
      }
    }
    if (!consistent) continue;

    const deltaPercent =
      history[group.endIndex].usedPercent - history[group.startIndex].usedPercent;
    if (deltaPercent < -0.01) continue;

    const totalsByThread = new Map<string, { activeSeconds: number; runs: number }>();
    for (const bracket of group.brackets) {
      const total = totalsByThread.get(bracket.threadId) ?? { activeSeconds: 0, runs: 0 };
      total.activeSeconds += Math.max(1, bracket.run.completedAt - bracket.run.startedAt);
      total.runs += 1;
      totalsByThread.set(bracket.threadId, total);
    }

    const totalActiveSeconds = [...totalsByThread.values()]
      .reduce((sum, row) => sum + row.activeSeconds, 0);
    for (const [threadId, row] of totalsByThread) {
      const weight = totalActiveSeconds > 0 ? row.activeSeconds / totalActiveSeconds : 0;
      if (weight <= 0) continue;
      const current = result.get(threadId);
      result.set(threadId, current ? {
        percent: current.percent + deltaPercent * weight,
        sampleIntervals: current.sampleIntervals + row.runs,
        resetSegments: 1
      } : {
        percent: deltaPercent * weight,
        sampleIntervals: row.runs,
        resetSegments: 1
      });
    }
  }

  return result;
}

export function estimateThreadUsageForBank(
  rawHistory: RateLimitWindow[],
  taskRuns: ThreadTaskRun[]
): Map<string, ThreadUsageAccumulator> {
  const history = normalizeHistory(rawHistory);
  if (history.length < 2 || taskRuns.length === 0) return new Map();

  const combined = new Map<string, ThreadUsageAccumulator>();
  const coveredRuns = new Map<string, Set<ThreadTaskRun>>();
  for (const segment of splitAtResets(history)) {
    if (segment.length < 2) continue;
    const start = segment[0].observedAt;
    const end = segment.at(-1)!.observedAt;
    const segmentRuns = taskRuns.filter(
      (run) => run.startedAt >= start && run.completedAt <= end
    );
    const estimates = estimateContinuousSegment(segment, segmentRuns);
    for (const [threadId, estimate] of estimates) {
      const covered = coveredRuns.get(threadId) ?? new Set<ThreadTaskRun>();
      for (const run of segmentRuns) {
        if (run.threadId === threadId) covered.add(run);
      }
      coveredRuns.set(threadId, covered);
      const current = combined.get(threadId);
      combined.set(threadId, current ? {
        percent: current.percent + estimate.percent,
        sampleIntervals: current.sampleIntervals + estimate.sampleIntervals,
        resetSegments: current.resetSegments + 1
      } : estimate);
    }
  }

  // Never present a partial estimate as complete. A thread stays unavailable
  // until every completed task run is enclosed by reliable timestamp samples.
  for (const threadId of combined.keys()) {
    const covered = coveredRuns.get(threadId);
    const complete = taskRuns
      .filter((run) => run.threadId === threadId)
      .every((run) => covered?.has(run));
    if (!complete) combined.delete(threadId);
  }
  return combined;
}
