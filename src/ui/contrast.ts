/** WCAG contrast maths (same as tools/lib.mjs), used live on the style-test page and in tests. */
export function parseColor(v: string): [number, number, number] {
  const s = v.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let hex = m[1];
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  m = s.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  throw new Error(`cannot parse colour "${v}"`);
}
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(parseColor(a)), luminance(parseColor(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export const MIN = { body: 4.5, large: 3, icon: 3 } as const;
