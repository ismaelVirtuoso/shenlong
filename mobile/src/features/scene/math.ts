export const clamp = (x: number, a: number, b: number) => {
  'worklet';
  return Math.min(b, Math.max(a, x));
};
export const lerp = (a: number, b: number, k: number) => {
  'worklet';
  return a + (b - a) * k;
};
/** smoothstep entre a e b */
export const smooth = (a: number, b: number, x: number) => {
  'worklet';
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** hash determinístico 0..1 */
export const rand = (n: number) => {
  'worklet';
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
