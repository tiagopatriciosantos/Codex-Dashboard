import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProjection } from './analytics.js';
const now=Math.floor(Date.now()/1000);
const p=(seconds:number, usedPercent:number)=>({key:'seven-day',label:'Weekly',usedPercent,windowDurationMins:10080,resetsAt:now+600000,observedAt:seconds});
test('short baseline may show burn but not a multi-day extrapolation',()=>{
  const history=[p(now-600,0),p(now-300,2),p(now,4)];
  const result=calculateProjection(history[2],history);
  assert.equal(result.confidence,'low'); assert.equal(result.projectedPercentAtReset,null);
});
test('stale snapshots and resets do not extrapolate an old burn rate',()=>{
  assert.equal(calculateProjection(p(now-600,20),[]).projectedPercentAtReset,null);
  const history=[p(now-3600,60),p(now-1800,80),p(now,1)];
  const result=calculateProjection(history[2],history);
  assert.equal(result.projectedPercentAtReset,null); assert.equal(result.resetEventsDetected,1);
});
