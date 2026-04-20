/**
 * Gộp object lồng nhau (object con được merge; mảng và primitive ghi đè).
 */
export function mergeDeep(target, source) {
  if (source == null) return target;
  const base = target && typeof target === 'object' && !Array.isArray(target) ? { ...target } : {};
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = base[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv)) {
      base[key] = mergeDeep(tv && typeof tv === 'object' && !Array.isArray(tv) ? tv : {}, sv);
    } else {
      base[key] = sv;
    }
  }
  return base;
}
