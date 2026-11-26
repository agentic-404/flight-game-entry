// Ridge Runner — a small seeded random source. Mulberry32 is short, fast
// and deterministic: the same seed always builds the same world, so a
// screenshot staged from a seed always shows the same frame.
export function createRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A float in [min, max). */
export function range(random, min, max) {
  return min + random() * (max - min);
}

/** An integer in [min, max]. */
export function rangeInt(random, min, max) {
  return Math.floor(range(random, min, max + 1));
}

/** Pick one item from an array. */
export function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}
