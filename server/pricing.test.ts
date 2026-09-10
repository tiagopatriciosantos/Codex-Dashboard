import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateUsageCost, findPricing } from './pricing.js';
const u = { inputTokens: 100000, cachedInputTokens: 50000, outputTokens: 10000, reasoningOutputTokens: 9000, totalTokens: 110000 };
test('Astra standard API equivalent splits cache and never adds reasoning twice', () => {
  assert.equal(estimateUsageCost('gpt-6-astra', u), 1.05);
  assert.equal(estimateUsageCost('gpt-6-astra', {...u, reasoningOutputTokens:0}), 1.05);
  assert.equal(findPricing('gpt-6-astra-2026-09-05')?.id, 'gpt-6-astra');
  assert.equal(findPricing('gpt-6-astra-unknown'), null);
});
test('Astra long context is API-equivalent, not Codex subscription charging', () => {
  const cost = estimateUsageCost('gpt-6-astra', {...u,inputTokens:300000,cachedInputTokens:100000});
  assert.equal(cost, 4.95);
  assert.equal(estimateUsageCost('unknown', u), null);
});
