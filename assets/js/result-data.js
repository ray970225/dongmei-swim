// Keep the public tuple format in one place for the build and both result pages.
export const RESULT_FIELDS = [
  'id', 'swimmer_id', 'swimmer', 'team', 'event', 'competition', 'competition_date',
  'rank', 'time', 'time_milliseconds', 'pool_type', 'round', 'age_group', 'splits'
];

export const decodeRows = tuples => (Array.isArray(tuples) ? tuples : []).map(tuple =>
  Object.fromEntries(RESULT_FIELDS.map((field, index) => [field, tuple[index] ?? null]))
);

export const newestFirst = (a, b) =>
  String(b.competition_date || '').localeCompare(String(a.competition_date || ''))
  || String(a.id || '').localeCompare(String(b.id || ''));

export const performanceKey = row =>
  [row.swimmer_id || row.swimmer || '', row.event || '', row.pool_type || '未列池別'].join('|');
