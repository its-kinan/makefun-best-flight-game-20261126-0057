// A small seeded random number generator (mulberry32): the same seed gives the
// same valley, the same rings and the same gusts, which is what makes the
// screenshot scenes repeatable and every run of the game fair.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A deterministic 1-D value-noise field from a seeded stream of control points. */
export function makeNoise(random, points, min, max) {
  const values = [];
  for (let i = 0; i < points; i += 1) values.push(min + random() * (max - min));
  return function noise(x) {
    const scaled = ((x % points) + points) % points;
    const i = Math.floor(scaled);
    const j = (i + 1) % points;
    const f = scaled - i;
    const smooth = f * f * (3 - 2 * f);
    return values[i] + (values[j] - values[i]) * smooth;
  };
}
