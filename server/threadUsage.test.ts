import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateThreadUsageForBank } from './threadUsage.js';
import type { RateLimitWindow } from './types.js';

function point(observedAt: number, usedPercent: number): RateLimitWindow {
  return {
    key: 'five-hour',
    label: '5-hour window',
    usedPercent,
    windowDurationMins: 300,
    resetsAt: 20_000,
    observedAt
  };
}

function event(
  threadId: string,
  startedAt: number,
  completedAt: number
) {
  return { threadId, startedAt, completedAt };
}

test('subtracts quota snapshots bracketing a completed task run', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 20), point(60, 20), point(120, 24)],
    [event('thread-a', 30, 90)]
  );
  assert.equal(result.get('thread-a')?.percent, 4);
});

test('waits for a quota sample after the completed task run', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 20), point(60, 22)],
    [event('thread-a', 30, 90)]
  );
  assert.equal(result.has('thread-a'), false);
});

test('splits a coarse quota interval between sequential tasks by active time', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 10), point(120, 14)],
    [event('thread-a', 20, 80), event('thread-b', 80, 100)]
  );
  assert.equal(result.get('thread-a')?.percent, 3);
  assert.equal(result.get('thread-b')?.percent, 1);
});

test('keeps sequential threads separate when a quota snapshot divides them', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 10), point(60, 12), point(120, 15)],
    [event('thread-a', 20, 50), event('thread-b', 70, 110)]
  );
  assert.equal(result.get('thread-a')?.percent, 2);
  assert.equal(result.get('thread-b')?.percent, 3);
});

test('does not span the idle gap between separate runs of one thread', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 10), point(60, 12), point(120, 20), point(180, 23)],
    [
      event('thread-a', 10, 50),
      event('thread-b', 70, 110),
      event('thread-a', 130, 170)
    ]
  );
  assert.equal(result.get('thread-a')?.percent, 5);
  assert.equal(result.get('thread-b')?.percent, 8);
  assert.equal(result.get('thread-a')?.sampleIntervals, 2);
});

test('reports a fully bracketed zero change instead of leaving usage unavailable', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 30), point(60, 30)],
    [event('thread-a', 10, 50)]
  );
  assert.equal(result.get('thread-a')?.percent, 0);
});

test('does not attribute an interval that crosses a downward reset boundary', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 20), point(60, 19), point(120, 24)],
    [event('thread-a', 30, 90)]
  );
  assert.equal(result.has('thread-a'), false);
});

test('keeps reliable estimates on both sides of an unexpected reset', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 20), point(60, 24), point(120, 3), point(180, 8)],
    [event('thread-a', 20, 50), event('thread-a', 130, 170)]
  );
  assert.equal(result.get('thread-a')?.percent, 9);
  assert.equal(result.get('thread-a')?.resetSegments, 2);
});

test('preserves usage above 100 percent', () => {
  const result = estimateThreadUsageForBank(
    [point(0, 96), point(60, 104), point(120, 111)],
    [event('thread-a', 10, 50), event('thread-a', 70, 110)]
  );
  assert.equal(result.get('thread-a')?.percent, 15);
});
