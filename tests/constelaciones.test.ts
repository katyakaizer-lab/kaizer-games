import { afterEach, describe, expect, it } from 'vitest';
import raw from '../src/data/constelaciones/sample-sentences.json';
import {
  initialLightState, isPrefixOfAnyOrder, lightIssues, matchedOrder, nextHint, renderLight, targetSentence, tasksFor,
  type Constellation, type ConstellationData,
} from '../src/games/constelaciones/sentence';
import { validateConstelaciones } from '../src/games/constelaciones/validate';
import { galaxyLayout, minSpacing, starLayout } from '../src/games/constelaciones/layout';
import { DAY, REVIEW_DAYS, entry, isDue, markCleared, markReviewed } from '../src/games/constelaciones/progress';
import { moodFor, CHEER_MINUTES, REST_DAYS } from '../src/app/pet-state';
import { _setBackend } from '../src/data/storage';

const data = raw as unknown as ConstellationData;
const byId = (id: string) => structuredClone(data.constellations.find((c) => c.id === id)!) as Constellation;
const clone = (): ConstellationData => structuredClone(data);

describe('order checking', () => {
  const c = byId('c-a1-005'); // two accepted orders
  it('accepts a prefix of any accepted order', () => {
    expect(c.orders.length).toBe(2);
    expect(isPrefixOfAnyOrder(c, [c.orders[0][0]])).toBe(true);
    expect(isPrefixOfAnyOrder(c, [c.orders[1][0]])).toBe(true);
    expect(isPrefixOfAnyOrder(c, [99])).toBe(false);
  });
  it('matches a full order and suggests the next star', () => {
    expect(matchedOrder(c, c.orders[1])).toEqual(c.orders[1]);
    expect(matchedOrder(c, c.orders[1].slice(0, 2))).toBe(null);
    expect(nextHint(c, c.orders[0].slice(0, 1))).toBe(c.orders[0][1]);
  });
});

describe('canonical sentence and "Ilumina la frase"', () => {
  it('rebuilds every sample sentence from its first order', () => {
    for (const c of data.constellations) expect(targetSentence(c as Constellation)).toBe(c.text);
  });
  it('tasks grow with the level', () => {
    expect([...tasksFor('A1')].sort()).toEqual(['capital', 'close']);
    expect(tasksFor('A2').has('accent')).toBe(true);
    expect(tasksFor('A2').has('comma')).toBe(false);
    expect(tasksFor('B1').has('comma') && tasksFor('B1').has('open')).toBe(true);
  });
  it('A1 pre-fills the opening mark and accents; the learner adds capital and closing mark', () => {
    const c = byId('c-a1-002'); // ¿Dónde vives?
    const s = initialLightState(c, c.orders[0], tasksFor('A1'));
    expect(renderLight(c, s)).toBe('¿dónde vives');
    expect(lightIssues(c, s)).toEqual(['capital', 'close']);
    s.caps[0] = true; s.gaps[2] = '?';
    expect(renderLight(c, s)).toBe('¿Dónde vives?');
    expect(lightIssues(c, s)).toEqual([]);
  });
  it('B1 needs commas, accents and capitals; each mistake gets its own hint', () => {
    const c = byId('c-b1-001'); // Si tuviera más tiempo, aprendería japonés.
    const s = initialLightState(c, c.orders[0], tasksFor('B1'));
    expect(lightIssues(c, s)).toEqual(['capital', 'close', 'accent', 'comma']);
    s.caps[0] = true; s.gaps[6] = '.';
    for (const a of c.accents) s.accents[a.index] = a.correct;
    expect(lightIssues(c, s)).toEqual(['comma']);
    s.gaps[4] = ',';
    expect(renderLight(c, s)).toBe(c.text);
    expect(lightIssues(c, s)).toEqual([]);
  });
  it('names need a capital too', () => {
    const c = byId('c-a1-003'); // Me llamo Ana y soy profesora.
    const s = initialLightState(c, c.orders[0], tasksFor('A1'));
    s.caps[0] = true; s.gaps[6] = '.';
    expect(lightIssues(c, s)).toEqual(['capital']);
    s.caps[2] = true;
    expect(lightIssues(c, s)).toEqual([]);
  });
  it('an alternative order is checked against its own target', () => {
    const c = byId('c-a2-001');
    const order = c.orders[1];
    const s = initialLightState(c, order, tasksFor('A2'));
    s.caps[0] = true; s.gaps[order.length] = '.';
    for (const a of c.accents) s.accents[a.index] = a.correct;
    expect(lightIssues(c, s)).toEqual([]);
    expect(renderLight(c, s)).toBe(targetSentence(c, order));
  });
});

describe('validator', () => {
  it('passes the sample data and counts unreviewed items', () => {
    const r = validateConstelaciones(clone());
    expect(r.errors).toEqual([]);
    expect(r.unreviewed.length).toBe(25);
  });
  const broken = (f: (d: ConstellationData) => void) => { const d = clone(); f(d); return validateConstelaciones(d).errors.join('\n'); };
  it('fails an order that is not a permutation', () => expect(broken((d) => { d.constellations[0].orders[0] = [0, 0, 1, 2, 3, 4]; })).toMatch(/not a permutation/));
  it('fails when the rebuilt sentence differs from text', () => expect(broken((d) => { d.constellations[0].text = 'El gato duerme en la mesa.'; })).toMatch(/does not equal text/));
  it('fails accent options without the correct form', () => expect(broken((d) => { d.constellations[1].accents[0].options = ['donde', 'dondé']; })).toMatch(/lack the correct form/));
  it('fails repeated ids', () => expect(broken((d) => { d.constellations[1].id = d.constellations[0].id; })).toMatch(/id repeats/));
  it('fails a story that references a missing constellation', () => expect(broken((d) => { d.stories[0].constellations.push('c-nope'); })).toMatch(/missing constellation c-nope/));
});

describe('layout', () => {
  it('is the same every time', () => {
    expect(starLayout('c-b2-001', 9)).toEqual(starLayout('c-b2-001', 9));
    expect(galaxyLayout(['a', 'b', 'c']).pos.get('b')).toEqual(galaxyLayout(['a', 'b', 'c']).pos.get('b'));
  });
  it('keeps stars apart (44px tap targets never overlap at 320px) for every sample', () => {
    for (const c of data.constellations) {
      const { pts, aspect } = starLayout(c.id, c.tokens.length);
      expect(pts.length).toBe(c.tokens.length);
      expect(minSpacing(pts, aspect), c.id).toBeGreaterThanOrEqual(0.95 ** 11);
      // 44px targets: centres at least 44px apart in the 320px frame
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = (pts[i].x - pts[j].x) * 320, dy = (pts[i].y - pts[j].y) * 320 * aspect;
        expect(Math.max(Math.abs(dx), Math.abs(dy)), c.id).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

describe('review schedule and pet mood', () => {
  afterEach(() => _setBackend(undefined));
  it('follows 1, 3, 7, 21, 60 days and then stops', () => {
    _setBackend(null);
    const t0 = 1_000_000;
    markCleared('x', t0);
    expect(REVIEW_DAYS).toEqual([1, 3, 7, 21, 60]);
    expect(entry('x')!.due).toBe(t0 + DAY);
    expect(isDue('x', t0 + DAY - 1)).toBe(false);
    expect(isDue('x', t0 + DAY)).toBe(true);
    let now = t0 + DAY;
    for (const days of [3, 7, 21, 60]) { const e = markReviewed('x', 1, now)!; expect(e.due).toBe(now + days * DAY); now = e.due!; }
    expect(markReviewed('x', 0, now)!.due).toBe(null);
    expect(entry('x')!.hints).toBe(4);
    markCleared('x', now); // replaying never resets the schedule
    expect(entry('x')!.due).toBe(null);
  });
  it('mood: happy right after a constellation, resting after days away, never sad', () => {
    const now = 10 * DAY;
    expect(moodFor({}, now)).toBe('calma');
    expect(moodFor({ lastCelebrationAt: now - 60_000, lastPracticeAt: now - 60_000 }, now)).toBe('alegria');
    expect(moodFor({ lastCelebrationAt: now - (CHEER_MINUTES + 1) * 60_000, lastPracticeAt: now - 60 * 60_000 }, now)).toBe('calma');
    expect(moodFor({ lastPracticeAt: now - REST_DAYS * DAY }, now)).toBe('siesta');
  });
});
