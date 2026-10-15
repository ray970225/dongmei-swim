// Source split values are cumulative milliseconds at each measured distance.
// Keep only measured checkpoints; never manufacture missing intermediate times.
export function normalizeCumulativeSplits(source, totalMilliseconds = null) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const total = Number(totalMilliseconds);
  const checkpoints = Object.entries(source)
    .map(([distance, milliseconds]) => [Number(distance), Number(milliseconds)])
    .filter(([distance, milliseconds]) => Number.isInteger(distance) && distance > 0 && distance <= 1500
      && Number.isSafeInteger(milliseconds) && milliseconds > 0)
    .sort(([a], [b]) => a - b);
  const normalized = {};
  let previous = 0;
  for (const [distance, milliseconds] of checkpoints) {
    if (milliseconds <= previous || (Number.isFinite(total) && total > 0 && milliseconds > total + 1000)) continue;
    normalized[distance] = milliseconds;
    previous = milliseconds;
  }
  return normalized;
}

export function splitSegments(source, totalMilliseconds = null) {
  const checkpoints = Object.entries(normalizeCumulativeSplits(source, totalMilliseconds))
    .map(([distance, milliseconds]) => ({ distance: Number(distance), milliseconds }));
  return checkpoints.map((point, index) => ({
    ...point,
    from: index ? checkpoints[index - 1].distance : 0,
    segmentMilliseconds: point.milliseconds - (index ? checkpoints[index - 1].milliseconds : 0)
  }));
}

export function formatSplitTime(milliseconds) {
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = ((milliseconds % 60000) / 1000).toFixed(2).padStart(5, '0');
  return minutes ? `${minutes}:${seconds}` : seconds;
}
