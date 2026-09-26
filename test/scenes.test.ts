import {describe, expect, it} from 'vitest';
import {SCENES, scenesFor} from '@shared/scenes';

describe('scenesFor', () => {
  it('matches settings by keyword', () => {
    expect(scenesFor('HackU の決勝ピッチ').map(s => s.id)).toEqual(['hackathon']);
    expect(scenesFor('インターン選考のプレゼン').map(s => s.id)).toEqual(['job']);
    expect(scenesFor(undefined)).toEqual([]);
  });
  it('cites a source for every scene', () => {
    for (const s of SCENES) expect(s.sources.length).toBeGreaterThan(0);
  });
});
