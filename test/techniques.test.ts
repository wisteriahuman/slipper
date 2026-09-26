import {describe, expect, it} from 'vitest';
import {FLOW_TECHNIQUES, PAGE_TECHNIQUES, TECHNIQUES, techniqueById} from '@shared/techniques';

describe('technique catalog', () => {
  it('has a broad catalog with unique ids and a source for every entry', () => {
    expect(PAGE_TECHNIQUES.length).toBeGreaterThanOrEqual(20);
    expect(FLOW_TECHNIQUES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TECHNIQUES.map(t => t.id)).size).toBe(TECHNIQUES.length);
    for (const t of TECHNIQUES) expect(t.source.url).toMatch(/^https:\/\//);
    for (const t of PAGE_TECHNIQUES) expect(['1', '2-3']).toContain(t.slides);
    for (const t of FLOW_TECHNIQUES) expect(t.steps?.length).toBeGreaterThan(0);
  });
});

describe('operational recipes', () => {
  it('has application requirements for every named technique', () => {
    for (const t of TECHNIQUES) {
      const recipe = recipeFor(t.id);
      expect(recipe.needs.length).toBeGreaterThan(0);
      expect(recipe.must.length).toBeGreaterThan(0);
      expect(recipe.avoid.length).toBeGreaterThan(0);
    }
  });
});
import {recipeFor} from '@shared/technique-recipes';
