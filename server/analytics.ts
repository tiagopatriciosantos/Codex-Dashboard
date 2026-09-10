import {
  getRateLimitHistory,
  getRecentChatTaskRuns,
  getThreadTaskRuns
} from './db.js';
import { estimateThreadUsageForBank } from './threadUsage.js';
import type {
  LimitProjection,
  ModelEfficiency,
  ProjectionPoint,
  RateLimitWindow
} from './types.js';

const EMPTY_PROJECTION: LimitProjection = {
  projectedPercentAtReset: null,
  projectedExhaustionAt: null,
  percentPerHour: null,
  paceRatio: null,
  confidence: 'unavailable',
  samplesUsed: 0,
  resetEventsDetected: 0
};

const MODEL_EFFICIENCY_CHAT_LIMIT = 30;

function regression(points: RateLimitWindow[]): { slopePerSecond: number; spanSeconds: number } | null {
  if (points.length < 2) return null;
  const origin = points[0].observedAt;
  const xs = points.map((point) => point.observedAt - origin);
  const ys = points.map((point) => point.usedPercent);
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const numerator = xs.reduce((sum, x, index) => sum + (x - meanX) * (ys[index] - meanY), 0);
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  return {
    slopePerSecond: Math.max(0, numerator / denominator),
    spanSeconds: xs[xs.length - 1] - xs[0]
  };
}

function splitContinuousHistory(history: RateLimitWindow[]): RateLimitWindow[][] {
  const ordered = [...history].sort((a, b) => a.observedAt - b.observedAt);
  const deduped: RateLimitWindow[] = [];
  for (const point of ordered) {
    const previous = deduped.at(-1);
    if (previous?.observedAt === point.observedAt) deduped[deduped.length - 1] = point;
    else deduped.push(point);
  }

  const segments: RateLimitWindow[][] = [];
  for (const point of deduped) {
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

function activeProjectionHistory(
  current: RateLimitWindow,
  history: RateLimitWindow[]
): { points: RateLimitWindow[]; resetEventsDetected: number } {
  const matching = history.filter(
    (point) =>
      point.key === current.key &&
      point.resetsAt === current.resetsAt &&
      point.observedAt <= current.observedAt
  );
  if (!matching.some((point) => point.observedAt === current.observedAt)) matching.push(current);
  const segments = splitContinuousHistory(matching);
  return {
    points: segments.at(-1) ?? [],
    resetEventsDetected: Math.max(0, segments.length - 1)
  };
}

export function calculateProjection(
  current: RateLimitWindow | null,
  history: RateLimitWindow[]
): LimitProjection {
  if (!current) return EMPTY_PROJECTION;
  const now = Math.floor(Date.now() / 1000);
  const recentWindow = current.windowDurationMins <= 360 ? 90 * 60 : 24 * 60 * 60;
  const active = activeProjectionHistory(current, history);
  const recent = active.points.filter((point) => point.observedAt >= now - recentWindow);
  const fitPoints = recent.length >= 2 ? recent : active.points;
  const fit = regression(fitPoints);
  if (!fit || fit.spanSeconds < 5 * 60 || fitPoints.length < 3 || current.resetsAt <= now || now - current.observedAt > 300) {
    return {
      ...EMPTY_PROJECTION,
      samplesUsed: fitPoints.length,
      resetEventsDetected: active.resetEventsDetected
    };
  }

  const remainingSeconds = Math.max(0, current.resetsAt - now);
  const projected = current.usedPercent + fit.slopePerSecond * remainingSeconds;
  const projectedExhaustionAt = current.usedPercent >= 100
    ? now
    : fit.slopePerSecond > 0
      ? now + Math.round((100 - current.usedPercent) / fit.slopePerSecond)
      : null;
  const sustainableSlope = remainingSeconds > 0
    ? Math.max(0, 100 - current.usedPercent) / remainingSeconds
    : 0;
  const paceRatio = sustainableSlope > 0 ? fit.slopePerSecond / sustainableSlope : null;
  const confidence: LimitProjection['confidence'] =
    fit.spanSeconds >= recentWindow * 0.65 && recent.length >= 8
      ? 'high'
      : fit.spanSeconds >= 30 * 60 && recent.length >= 4
        ? 'medium'
        : 'low';

  return {
    projectedPercentAtReset: confidence === 'low' ? null : Math.max(0, projected),
    projectedExhaustionAt:
      confidence !== 'low' && projectedExhaustionAt && projectedExhaustionAt <= current.resetsAt
        ? projectedExhaustionAt
        : null,
    percentPerHour: fit.slopePerSecond * 3600,
    paceRatio,
    confidence,
    samplesUsed: fitPoints.length,
    resetEventsDetected: active.resetEventsDetected
  };
}

export function buildChartPoints(
  current: RateLimitWindow | null,
  history: RateLimitWindow[],
  projection: LimitProjection
): ProjectionPoint[] {
  const selectedHistory = current
    ? groupWindowHistory(
        history.filter((point) => point.resetsAt === current.resetsAt),
        current.key
      )[0] ?? []
    : groupWindowHistory(history, history.at(-1)?.key ?? '').flat();
  const ordered = [...selectedHistory].sort((a, b) => a.observedAt - b.observedAt);
  const points: ProjectionPoint[] = ordered.map((point, index) => ({
    timestamp: point.observedAt,
    usedPercent: point.usedPercent,
    reset: index > 0 && (
      point.resetsAt !== ordered[index - 1].resetsAt ||
      point.usedPercent < ordered[index - 1].usedPercent - 0.01
    )
  }));
  if (!current || projection.projectedPercentAtReset === null) return points;

  const nowPoint = points.at(-1);
  if (!nowPoint || nowPoint.timestamp !== current.observedAt) {
    points.push({ timestamp: current.observedAt, usedPercent: current.usedPercent });
  }
  if (
    current.usedPercent < 100 &&
    projection.projectedExhaustionAt &&
    projection.projectedExhaustionAt < current.resetsAt
  ) {
    points.push({
      timestamp: projection.projectedExhaustionAt,
      usedPercent: 100,
      projected: true
    });
  }
  points.push({
    timestamp: current.resetsAt,
    usedPercent: projection.projectedPercentAtReset,
    projected: true
  });
  return points;
}

interface EfficiencyAccumulator {
  estimatedUsagePercent: number;
  activeMinutes: number;
  tokens: number;
  estimatedApiCostUsd: number;
  sampleIntervals: number;
}

function groupHistory(history: RateLimitWindow[]): RateLimitWindow[][] {
  const groups = new Map<string, RateLimitWindow[]>();
  for (const point of history) {
    const key = `${point.key}:${point.resetsAt}`;
    const group = groups.get(key) ?? [];
    group.push(point);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) =>
    group
      .sort((a, b) => a.observedAt - b.observedAt)
      .filter((point, index, all) =>
        index === 0 ||
        point.observedAt !== all[index - 1].observedAt ||
        point.usedPercent !== all[index - 1].usedPercent
      )
  );
}

function groupWindowHistory(
  history: RateLimitWindow[],
  preferredKey: string
): RateLimitWindow[][] {
  const banks = new Map<number, RateLimitWindow[]>();
  for (const point of history) {
    const bank = banks.get(point.resetsAt) ?? [];
    bank.push(point);
    banks.set(point.resetsAt, bank);
  }

  const selected: RateLimitWindow[] = [];
  for (const bank of banks.values()) {
    const sources = new Map<string, RateLimitWindow[]>();
    for (const point of bank) {
      const source = sources.get(point.key) ?? [];
      source.push(point);
      sources.set(point.key, source);
    }
    const preferred = sources.get(preferredKey);
    const source = preferred && preferred.length >= 2
      ? preferred
      : [...sources.values()].sort((a, b) =>
          b.length - a.length ||
          (b.at(-1)?.observedAt ?? 0) - (a.at(-1)?.observedAt ?? 0)
        )[0] ?? [];
    selected.push(...source);
  }

  return groupHistory(selected).sort(
    (a, b) => (a[0]?.observedAt ?? 0) - (b[0]?.observedAt ?? 0)
  );
}

type RecentTaskRun = ReturnType<typeof getRecentChatTaskRuns>[number];

export function estimateModelEfficiencyForHistory(
  history: RateLimitWindow[],
  taskRuns: RecentTaskRun[]
): ModelEfficiency[] {
  if (history.length === 0 || taskRuns.length === 0) return [];

  const preferredKey = Math.abs(history[0].windowDurationMins - 300) <= 5
    ? 'five-hour'
    : Math.abs(history[0].windowDurationMins - 10_080) <= 60
      ? 'seven-day'
      : null;
  const latest = preferredKey
    ? [...history].reverse().find((point) => point.key === preferredKey) ?? history.at(-1)!
    : history.at(-1)!;
  const groups = groupWindowHistory(history, latest.key);
  if (groups.length === 0) return [];

  const reliableTotals = new Map<string, EfficiencyAccumulator>();
  const countedRuns = new Set<string>();

  for (const group of groups) {
    if (group.length < 2) continue;
    const firstObservedAt = group[0].observedAt;
    const lastObservedAt = group.at(-1)!.observedAt;
    const bankRuns = taskRuns.filter(
      (run) =>
        !countedRuns.has(run.promptId) &&
        run.model !== 'unknown' &&
        run.model !== 'codex-auto-review' &&
        run.startedAt >= firstObservedAt &&
        run.completedAt <= lastObservedAt
    );
    if (bankRuns.length === 0) continue;

    const estimates = estimateThreadUsageForBank(
      group,
      bankRuns.map((run) => ({
        threadId: run.model,
        startedAt: run.startedAt,
        completedAt: run.completedAt
      }))
    );
    for (const [model, estimate] of estimates) {
      const modelRuns = bankRuns.filter((run) => run.model === model);
      if (modelRuns.length === 0) continue;
      const accumulator = reliableTotals.get(model) ?? {
        estimatedUsagePercent: 0,
        activeMinutes: 0,
        tokens: 0,
        estimatedApiCostUsd: 0,
        sampleIntervals: 0
      };
      accumulator.estimatedUsagePercent += estimate.percent;
      accumulator.activeMinutes += modelRuns.reduce(
        (sum, run) => sum + Math.max(0, run.completedAt - run.startedAt) / 60,
        0
      );
      accumulator.tokens += modelRuns.reduce((sum, run) => sum + run.totalTokens, 0);
      accumulator.estimatedApiCostUsd += modelRuns.reduce(
        (sum, run) => sum + run.estimatedApiCostUsd,
        0
      );
      accumulator.sampleIntervals += estimate.sampleIntervals;
      reliableTotals.set(model, accumulator);
      for (const run of modelRuns) countedRuns.add(run.promptId);
    }
  }

  return [...reliableTotals.entries()]
    .map(([model, row]) => ({
      model,
      ...row,
      minutesPerPercent:
        row.estimatedUsagePercent > 0 ? row.activeMinutes / row.estimatedUsagePercent : null
    }))
    .sort((a, b) => (b.minutesPerPercent ?? -1) - (a.minutesPerPercent ?? -1));
}

export function calculateModelEfficiency(): ModelEfficiency[] {
  const taskRuns = getRecentChatTaskRuns(MODEL_EFFICIENCY_CHAT_LIMIT);
  const fiveHourHistory = getRateLimitHistory(300, undefined, 15);
  const fiveHour = estimateModelEfficiencyForHistory(fiveHourHistory, taskRuns);
  if (fiveHour.length > 0) return fiveHour;

  const sevenDayHistory = getRateLimitHistory(10_080, undefined, 30);
  return estimateModelEfficiencyForHistory(sevenDayHistory, taskRuns);
}

interface ThreadUsageAccumulator {
  percent: number;
  sampleIntervals: number;
  resetSegments: number;
}

function estimateThreadUsageForWindow(
  currentWindow: RateLimitWindow | null,
  durationMins: number,
  lookbackDays: number
): Map<string, ThreadUsageAccumulator> {
  const history = getRateLimitHistory(
    durationMins,
    undefined,
    lookbackDays
  );
  const referenceWindow = currentWindow ?? history.at(-1) ?? null;
  if (!referenceWindow) return new Map();
  const groups = groupWindowHistory(history, referenceWindow.key);
  if (groups.length === 0) return new Map();

  const durationSeconds = referenceWindow.windowDurationMins * 60;
  const earliestBankStart = Math.min(
    ...groups.map((group) => group[0].resetsAt - durationSeconds)
  );
  const taskRuns = getThreadTaskRuns(earliestBankStart);
  const latestBankByThread = new Map<string, { resetAt: number; latestRunAt: number }>();
  const reliableUsageByBank = new Map<number, Map<string, ThreadUsageAccumulator>>();

  for (const group of groups) {
    if (group.length < 2) continue;
    const resetAt = group[0].resetsAt;
    const firstObservedAt = group[0].observedAt;
    const lastObservedAt = group.at(-1)!.observedAt;
    const bankRuns = taskRuns.filter(
      (run) => run.startedAt >= firstObservedAt && run.completedAt <= lastObservedAt
    );

    for (const run of bankRuns) {
      const previous = latestBankByThread.get(run.threadId);
      if (
        !previous ||
        run.completedAt > previous.latestRunAt ||
        (run.completedAt === previous.latestRunAt && resetAt > previous.resetAt)
      ) {
        latestBankByThread.set(run.threadId, {
          resetAt,
          latestRunAt: run.completedAt
        });
      }
    }

    reliableUsageByBank.set(resetAt, estimateThreadUsageForBank(group, bankRuns));
  }

  const result = new Map<string, ThreadUsageAccumulator>();
  for (const [threadId, latestBank] of latestBankByThread) {
    const estimate = reliableUsageByBank.get(latestBank.resetAt)?.get(threadId);
    if (estimate) result.set(threadId, estimate);
  }
  return result;
}

export function calculateThreadUsageEstimates(
  fiveHourWindow: RateLimitWindow | null,
  sevenDayWindow: RateLimitWindow | null
): Map<string, {
  fiveHourPercent: number | null;
  sevenDayPercent: number | null;
  sampleIntervals: number;
  resetSegments: number;
}> {
  const fiveHour = estimateThreadUsageForWindow(fiveHourWindow, 300, 30);
  const sevenDay = estimateThreadUsageForWindow(sevenDayWindow, 10_080, 30);
  const ids = new Set([...fiveHour.keys(), ...sevenDay.keys()]);
  return new Map(
    [...ids].map((threadId) => {
      const short = fiveHour.get(threadId);
      const weekly = sevenDay.get(threadId);
      return [threadId, {
        fiveHourPercent: short?.percent ?? null,
        sevenDayPercent: weekly?.percent ?? null,
        sampleIntervals: Math.max(short?.sampleIntervals ?? 0, weekly?.sampleIntervals ?? 0),
        resetSegments: Math.max(short?.resetSegments ?? 0, weekly?.resetSegments ?? 0)
      }];
    })
  );
}
