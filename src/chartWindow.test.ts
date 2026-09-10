import test from 'node:test';
import assert from 'node:assert/strict';
import { brushIndices, orderedPoints, timeWindow } from './chartWindow';
const points = [{timestamp:0,usedPercent:0},{timestamp:3600,usedPercent:5},{timestamp:7200,usedPercent:10},{timestamp:604800,usedPercent:2806,projected:true}];
test('projection hidden by default does not compress real data', () => {
  const p = orderedPoints(points,false);
  assert.equal(p.length,3);
  assert.deepEqual(timeWindow(p,'all',null),[0,7200]);
});
test('recent presets never end at the projected reset', () => {
  assert.deepEqual(timeWindow(points,'1h',null),[3600,7200]);
  assert.deepEqual(brushIndices(points,[3600,7200]),[1,2]);
});
test('manual selection remains fixed when new samples arrive', () => {
  assert.deepEqual(timeWindow([...points,{timestamp:800000,usedPercent:3}],'all',[3600,7200]),[3600,7200]);
  assert.deepEqual(timeWindow([],'all',null),[0,1]);
});
