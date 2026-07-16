export function normalizePercentages(values: number[]) {
  const safe = values.map((value) => Math.max(0, Number.isFinite(value) ? value : 0));
  const total = safe.reduce((sum, value) => sum + value, 0) || safe.length || 1;
  const raw = safe.map((value) => (value / total) * 100);
  const result = raw.map(Math.floor);
  let remainder = 100 - result.reduce((sum, value) => sum + value, 0);
  raw
    .map((value, index) => ({ index, fraction: value - result[index] }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach((item) => {
      if (remainder > 0) {
        result[item.index] += 1;
        remainder -= 1;
      }
    });
  return result;
}
