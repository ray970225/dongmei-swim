const isTopEight = result => {
  const rank = Number(result.rank);
  return Number.isInteger(rank) && rank >= 1 && rank <= 8;
};

function competitionCategory(competition = '') {
  const name = String(competition);
  const categories = [];
  if (name.includes('全國')) categories.push('全國');
  if (name.includes('分齡')) categories.push('分齡');
  if (/縣|市|盃|運動會/.test(name) && !name.includes('全國')) categories.push('縣市');
  return categories.length ? categories.join(' ') : '其他';
}

const awardForRank = rank => `第 ${rank} 名`;

/**
 * 將成績通的所有第 1 至第 8 名成績，整理為首頁榮譽殿堂可直接讀取的卡片。
 * 同一選手在同一賽事的多個項目會合併到一張卡片，避免重複出現。
 */
export function createAutomaticHonours(results, syncedAt) {
  const groups = new Map();

  for (const result of results.filter(isTopEight)) {
    const key = [result.competition, result.competition_date, result.swimmer_id || result.swimmer].join('|');
    const rank = Number(result.rank);
    const item = {
      event: result.event || '未分類項目',
      time: result.time || '',
      rank,
      pool_type: result.pool_type || '',
      round: result.round || '',
      result_id: result.id
    };
    const existing = groups.get(key);
    if (existing) {
      existing.item_details.push(item);
      existing.best_rank = Math.min(existing.best_rank, rank);
      continue;
    }

    groups.set(key, {
      id: `swim-${String(result.id || key).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
      source: 'swim-results',
      cat: competitionCategory(result.competition),
      event: result.competition || '未命名賽事',
      name: result.swimmer || '未命名選手',
      year: String(result.competition_date || '').slice(0, 4),
      date: result.competition_date || '',
      best_rank: rank,
      item_details: [item],
      synced_at: syncedAt
    });
  }

  return [...groups.values()]
    .map(group => {
      group.item_details.sort((a, b) => a.rank - b.rank || a.event.localeCompare(b.event, 'zh-Hant'));
      return {
        ...group,
        award: awardForRank(group.best_rank),
        items: group.item_details.map(item => `${item.event} ${item.time} ${awardForRank(item.rank)}`.trim())
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.best_rank - b.best_rank || a.name.localeCompare(b.name, 'zh-Hant'));
}
