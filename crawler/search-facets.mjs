export function createSearchFacets(rows, generatedAt = new Date().toISOString()) {
  const latestDateByCompetition = new Map();
  const events = new Set();

  for (const row of rows || []) {
    const competition = String(row.competition || '').trim();
    const date = String(row.competition_date || '').trim();
    const event = String(row.event || '').trim();
    if (competition && date > (latestDateByCompetition.get(competition) || '')) {
      latestDateByCompetition.set(competition, date);
    }
    if (event) events.add(event);
  }

  return {
    version: 1,
    generated_at: generatedAt,
    competitions: [...latestDateByCompetition]
      .map(([name, latest_date]) => ({ name, latest_date }))
      .sort((a, b) => b.latest_date.localeCompare(a.latest_date) || a.name.localeCompare(b.name, 'zh-Hant')),
    events: [...events].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  };
}
