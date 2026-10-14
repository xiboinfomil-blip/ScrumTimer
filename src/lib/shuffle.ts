export function shuffle<T>(items: readonly T[], ensureChange = false): T[] {
  const result = [...items];
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    if (!ensureChange || result.length < 2 || result.some((item, index) => item !== items[index])) return result;
  }
  if (result.length > 1) [result[0], result[1]] = [result[1], result[0]];
  return result;
}