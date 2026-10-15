import assert from 'node:assert/strict';
import { normalizeCumulativeSplits, splitSegments, formatSplitTime } from '../assets/js/split-times.js';

const source = { 50: 29570, 100: 63230, 150: 97530, 200: 131820 };
assert.deepEqual(normalizeCumulativeSplits(source, 131820), source);
assert.deepEqual(splitSegments(source, 131820).map(point => point.segmentMilliseconds), [29570, 33660, 34300, 34290]);
assert.equal(formatSplitTime(131820), '2:11.82');
assert.equal(formatSplitTime(29570), '29.57');
assert.deepEqual(normalizeCumulativeSplits({ 50: 29570, 100: 29000, 150: 999999, bad: 123 }, 131820), { 50: 29570 });
assert.deepEqual(normalizeCumulativeSplits(null), {});
console.log('分段計時測試通過。');
