// Display helpers shared by the results, athlete roster and athlete profile pages.

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

// Source names sometimes differ only by spacing or full-width characters.
export const normalizeName = value => String(value || '').normalize('NFKC').replace(/[\s　]+/g, '').trim();

export function formatTime(milliseconds) {
  const totalSeconds = milliseconds / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2).padStart(5, '0');
  return minutes ? `${minutes}:${seconds}` : `${totalSeconds.toFixed(2)} 秒`;
}

export function eventInfo(event) {
  const match = String(event || '').match(/^(\d+)\s*(?:公尺|米)?\s*(.*)$/u);
  return match
    ? { distance: Number(match[1]), distanceLabel: `${match[1]} 公尺`, stroke: match[2] || String(event) }
    : { distance: Infinity, distanceLabel: '其他項目', stroke: String(event || '未列項目') };
}

const STROKE_ORDER = ['蝶', '仰', '蛙', '自由', '混合', '接力'];
export function strokeOrder(event) {
  const stroke = eventInfo(event).stroke;
  const index = STROKE_ORDER.findIndex(keyword => stroke.includes(keyword));
  return index === -1 ? STROKE_ORDER.length : index;
}

export const poolLabel = poolType => ({
  '長池': '長池（50 公尺）',
  '短池': '短池（25 公尺）',
  '未列池別': '未標示池別',
  '池別未列': '未標示池別'
}[poolType] || poolType || '未標示池別');

export const poolOrder = poolType => ({ '長池': 0, '短池': 1 }[poolType] ?? 2);

// 50 → 100 → 200 … then 蝶 → 仰 → 蛙 → 自由 → 混合, so lists read like a meet program.
export function compareEvents(a, b) {
  return eventInfo(a).distance - eventInfo(b).distance
    || strokeOrder(a) - strokeOrder(b)
    || String(a).localeCompare(String(b), 'zh-Hant');
}
