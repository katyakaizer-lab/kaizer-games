/** Checks that the token fonts really cover Spanish (and Russian for body text) without falling back. */
export const ACCENT_LINE = '¿¡ áéíóúü ñ ÁÉÍÓÚÜ Ñ';
export const CYRILLIC_LINE = 'Ёё Жж Щщ Юю Яя';

export function tokenFamily(token: '--font-head' | '--font-body'): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(token);
  return (v.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
}

export interface FontResult { token: string; family: string; weight: number; text: string; ok: boolean }

export async function fontTest(): Promise<FontResult[]> {
  const cases: [string, number, string][] = [
    ['--font-head', 400, ACCENT_LINE],
    ['--font-body', 400, ACCENT_LINE],
    ['--font-body', 700, ACCENT_LINE],
    ['--font-body', 400, CYRILLIC_LINE],
  ];
  const out: FontResult[] = [];
  for (const [token, weight, text] of cases) {
    const family = tokenFamily(token as '--font-head');
    const spec = `${weight} 16px "${family}"`;
    let ok = false;
    try {
      // load() resolves to the faces that match and cover the text; an empty list means a fallback font would be used.
      const faces = await document.fonts.load(spec, text);
      ok = faces.length > 0 && faces.every((f) => f.status === 'loaded') && document.fonts.check(spec, text);
    } catch { ok = false; }
    out.push({ token, family, weight, text, ok });
  }
  return out;
}
