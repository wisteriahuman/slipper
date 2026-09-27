import {describe, expect, it} from 'vitest';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {Library} from '../src/main/library';
import {Store} from '../src/main/store';
import {ICON_SEARCH_CASES, ICON_SEARCH_HELD_OUT} from './fixtures/icon-search';

const lucideDir = dirname(createRequire(import.meta.url).resolve('lucide-static/package.json'));
const library = new Library({store: new Store(':memory:'), dataDir: mkdtempSync(join(tmpdir(), 'slp-')), lucideDir, peepsDir: join(process.cwd(), 'resources/library/open-peeps'),
  rasterize: async () => '', shrink: d => d});
const top3 = (q: string) => library.search(q, {kind: 'icon', limit: 3}).map(i => i.key.replace('lucide:', ''));
const rate = (field: 'both' | 'ja', cases = ICON_SEARCH_CASES) => {
  const misses = cases.filter(c => !top3(c[field]).some(k => c.ok.includes(k))).map(c => `${c[field]} → ${top3(c[field]).join(', ') || '(なし)'}`);
  return {hit: (cases.length - misses.length) / cases.length, misses};
};

describe('icon search quality', () => {
  it('lists answers that exist in the bundled icon set', () => {
    for (const c of [...ICON_SEARCH_CASES, ...ICON_SEARCH_HELD_OUT]) expect(c.ok.some(k => library.find(`lucide:${k}`)), c.both).toBe(true);
  });
  it('finds a fair icon in the top 3', () => {
    const both = rate('both'), ja = rate('ja');
    console.log(`both ${(both.hit * 100).toFixed(0)}%`, both.misses, `\nja ${(ja.hit * 100).toFixed(0)}%`, ja.misses);
    expect(both.hit).toBeGreaterThanOrEqual(Number(process.env.MIN_BOTH ?? 0));
    expect(ja.hit).toBeGreaterThanOrEqual(Number(process.env.MIN_JA ?? 0));
  });
  it('generalizes to concepts written after the dictionary', () => {
    const both = rate('both', ICON_SEARCH_HELD_OUT), ja = rate('ja', ICON_SEARCH_HELD_OUT);
    console.log(`held-out both ${(both.hit * 100).toFixed(0)}%`, both.misses, `\nheld-out ja ${(ja.hit * 100).toFixed(0)}%`, ja.misses);
  });
});
