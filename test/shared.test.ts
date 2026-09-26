import {describe, expect, it} from 'vitest';
import {VariantInputSchema, type SlideElement} from '@shared/element';
import {changeElement, fromEmu, toEmu} from '@shared/geometry';
import {allowedColors, chroma, coloredSlots, needsMeaning, type Palette} from '@shared/palette';
import {parseSlidesUrl} from '@shared/slides-url';
import {validateVariant} from '@shared/validate';

const text = (id: string, extra: Partial<SlideElement> = {}): SlideElement => ({id, type: 'text', text: 'hello', x: 64, y: 64, w: 400, h: 60, size: 32, invented: false, ...extra});
const noMeaning: Palette = {hex: {}, meanings: []};
const withAccent: Palette = {hex: {}, meanings: [{ref: 'ACCENT1', meaning: 'いま空いている'}]};
const variant = (elements: SlideElement[], ...more: SlideElement[][]) => ({requestId: 'r', aim: '場面で想像させる', gaveUp: '網羅性', technique: more.length ? 'build-up' : 'takahashi', frames: [elements, ...more].map(e => ({elements: e}))});

describe('parseSlidesUrl', () => {
  it('reads the presentation and the visible page', () => {
    expect(parseSlidesUrl('https://docs.google.com/presentation/d/abc_1-2/edit?slide=id.g1#slide=id.g409d_3_845'))
      .toMatchObject({presentationId: 'abc_1-2', pageId: 'g409d_3_845'});
  });
  it('falls back to the query when the hash is missing', () => {
    expect(parseSlidesUrl('https://docs.google.com/presentation/d/abc/edit?slide=id.p').pageId).toBe('p');
  });
  it('ignores other hosts and the presentation list', () => {
    expect(parseSlidesUrl('https://evil.example/presentation/d/abc/edit#slide=id.p').presentationId).toBeNull();
    expect(parseSlidesUrl('https://docs.google.com/presentation/u/0/')).toMatchObject({presentationId: null, pageId: null});
    expect(parseSlidesUrl('not a url').presentationId).toBeNull();
  });
});

// The deck from the field test: DARK1 is teal, DARK2 near-black, ACCENT1 grey, ACCENT3 orange.
const fieldTheme: Palette = {hex: {DARK1: '#1a9988', LIGHT1: '#ffffff', DARK2: '#1a1a1a', LIGHT2: '#e9edee', ACCENT1: '#595959', ACCENT2: '#6aa4c8', ACCENT3: '#eb5600', ACCENT4: '#a2ffe8', ACCENT5: '#1c3678', ACCENT6: '#ffb8a2'}, meanings: []};

describe('palette', () => {
  it('judges colors by their hue, not their slot name', () => {
    expect(chroma('#595959')).toBe(0);
    expect(needsMeaning(fieldTheme, 'DARK1')).toBe(true); // teal text color still carries meaning
    expect(needsMeaning(fieldTheme, 'ACCENT1')).toBe(false); // a grey "accent" is neutral
    expect(allowedColors(fieldTheme)).toEqual(['LIGHT1', 'DARK2', 'LIGHT2', 'ACCENT1']);
    expect(coloredSlots(fieldTheme)).toEqual(['DARK1', 'ACCENT2', 'ACCENT3', 'ACCENT4', 'ACCENT5', 'ACCENT6']);
  });
  it('allows a colored slot once its meaning is written down', () => {
    expect(allowedColors({...fieldTheme, meanings: [{ref: 'ACCENT3', meaning: '学生の声'}]})).toContain('ACCENT3');
  });
  it('allows accents only once their meaning is written down', () => {
    expect(allowedColors(noMeaning)).not.toContain('ACCENT1');
    expect(allowedColors(withAccent)).toContain('ACCENT1');
    expect(allowedColors({hex: {}, meanings: [{ref: 'ACCENT2', meaning: '  '}]})).not.toContain('ACCENT2');
  });
});

describe('validateVariant', () => {
  const ctx = {assetIds: ['img1'], palette: noMeaning};
  it('accepts a well-formed variant', () => {
    expect(validateVariant(variant([text('a'), {id: 'p', type: 'asset', assetId: 'img1', x: 500, y: 100, w: 300, h: 200, invented: false}]), ctx)).toEqual([]);
  });
  it('reports overflow, missing text, unknown assets and duplicate ids', () => {
    const problems = validateVariant(variant([text('a', {x: 900}), text('b', {text: ' '}), {id: 'c', type: 'asset', assetId: 'nope', x: 0, y: 0, w: 10, h: 10, invented: false}, text('a')]), ctx);
    expect(problems.join('\n')).toMatch(/a: キャンバス/);
    expect(problems.join('\n')).toMatch(/b: text がありません/);
    expect(problems.join('\n')).toMatch(/c: 存在しない assetId/);
    expect(problems.join('\n')).toMatch(/a: id が重複/);
  });
  it('rejects an accent whose meaning is not set, and explains how to emphasize instead', () => {
    const problems = validateVariant(variant([text('a', {color: 'ACCENT1'})]), ctx);
    expect(problems).toEqual([expect.stringContaining('意味が決まっていない色')]);
    expect(validateVariant(variant([text('a', {color: 'ACCENT1'})]), {...ctx, palette: withAccent})).toEqual([]);
  });
  it('limits how many elements may use the accent', () => {
    const three = ['a', 'b', 'c'].map(id => text(id, {color: 'ACCENT1'}));
    expect(validateVariant(variant(three), {...ctx, palette: withAccent})).toEqual([expect.stringContaining('3 か所')]);
  });
  it('accepts a sequence that keeps the layout and adds one thing', () => {
    const base = [text('title'), {id: 'chart', type: 'shape' as const, shape: 'rect' as const, fill: 'LIGHT1', x: 64, y: 150, w: 600, h: 300, invented: false}];
    const focus = {id: 'focus', type: 'shape' as const, shape: 'rect' as const, fill: 'DARK1', opacity: 0.3, x: 400, y: 150, w: 264, h: 300, invented: true};
    expect(validateVariant(variant(base, [...base, focus]), ctx)).toEqual([]);
  });
  it('rejects a sequence whose carried-over elements move, or that barely keeps anything', () => {
    const base = [text('a'), text('b', {y: 200}), text('c', {y: 300})];
    const moved = validateVariant(variant(base, [text('a', {x: 100}), text('b', {y: 200}), text('c', {y: 300})]), ctx);
    expect(moved).toEqual([expect.stringContaining('2枚目 a: 前のページと位置や大きさが違います')]);
    const unrelated = validateVariant(variant(base, [text('x'), text('b', {y: 200})]), ctx);
    expect(unrelated.join()).toContain('引き継いでいる要素が少なすぎます（1/3）');
  });
  it('schema rejects missing aim and invented flag', () => {
    expect(VariantInputSchema.safeParse({...variant([text('a')]), aim: ''}).success).toBe(false);
    const {invented: _, ...noFlag} = text('a');
    expect(VariantInputSchema.safeParse(variant([noFlag as SlideElement])).success).toBe(false);
  });
});

describe('geometry', () => {
  it('keeps edited elements on the canvas and leaves locked ones alone', () => {
    const [moved] = changeElement([text('a')], 'a', {x: 900, y: -50});
    expect(moved).toMatchObject({x: 560, y: 0});
    const [locked] = changeElement([text('a', {locked: true})], 'a', {x: 0, text: 'changed'});
    expect(locked).toMatchObject({x: 64, text: 'hello'});
  });
  it('maps the canvas onto the real page width in EMU', () => {
    const page = {width: 9144000, height: 5143500};
    expect(toEmu(960, page)).toBe(9144000);
    expect(fromEmu(toEmu(123, page), page)).toBeCloseTo(123);
  });
});
