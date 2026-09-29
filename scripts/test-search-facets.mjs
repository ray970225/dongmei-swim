import assert from 'node:assert/strict';
import { createSearchFacets } from '../crawler/search-facets.mjs';

const facets = createSearchFacets([
  { competition: '較早賽事', competition_date: '2025-01-10', event: '100 公尺自由式' },
  { competition: '最新賽事', competition_date: '2026-02-03', event: '50 公尺自由式' },
  { competition: '較早賽事', competition_date: '2025-03-10', event: '50 公尺自由式' },
  { competition: '', competition_date: '2026-04-01', event: '' }
], '2026-09-29T00:00:00.000Z');

assert.deepEqual(facets, {
  version: 1,
  generated_at: '2026-09-29T00:00:00.000Z',
  competitions: [
    { name: '最新賽事', latest_date: '2026-02-03' },
    { name: '較早賽事', latest_date: '2025-03-10' }
  ],
  events: ['100 公尺自由式', '50 公尺自由式']
});

console.log('Search facets tests passed.');
