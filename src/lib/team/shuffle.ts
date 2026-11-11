function randomInt(maxExclusive: number): number {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) return Math.floor(Math.random() * maxExclusive);
  const range = 0x1_0000_0000;
  const limit = range - range % maxExclusive;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return value[0] % maxExclusive;
}

export function shuffle<T>(items: readonly T[], ensureChange = false): T[] {
  const canChange = items.length > 1 && items.some(item => item !== items[0]);
  let result: T[];
  do {
    result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
  } while (ensureChange && canChange && result.every((item, index) => item === items[index]));
  return result;
}