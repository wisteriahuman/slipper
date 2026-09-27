import {describe, expect, it} from 'vitest';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {createRequire} from 'node:module';
import {Library, libraryAssetId} from '../src/main/library';
import {Store} from '../src/main/store';
import {creditPageRequests, CREDITS_BODY, CREDITS_PAGE} from '../src/main/credits';

// A PNG header is enough for the size reader: 300×150.
const png = (() => { const b = Buffer.alloc(33); b.write('\x89PNG\r\n\x1a\n', 0, 'latin1'); b.writeUInt32BE(300, 16); b.writeUInt32BE(150, 20); return `data:image/png;base64,${b.toString('base64')}`; })();
const lucideDir = dirname(createRequire(import.meta.url).resolve('lucide-static/package.json'));

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), 'slipper-lib-'));
  const store = new Store(':memory:');
  const rasterized: string[] = [];
  const library = new Library({store, dataDir, lucideDir, peepsDir: join(process.cwd(), 'resources/library/open-peeps'), shrink: d => d,
    rasterize: async svg => { rasterized.push(svg); return png; }});
  return {library, dataDir, rasterized};
}

describe('Library', () => {
  it('finds bundled icons by English tags and people by Japanese words', () => {
    const {library} = setup();
    expect(library.search('users').map(i => i.key)).toContain('lucide:users');
    expect(library.search('車いす', {kind: 'illustration'}).map(p => p.key)).toContain('peeps:peep-sitting-14');
    expect(library.search('車いす', {kind: 'icon', limit: 3}).map(p => p.key)).toContain('lucide:accessibility');
    expect(library.search('車いす').some(p => p.key.includes('car'))).toBe(false);
    expect(library.search('users', {kind: 'illustration'}).every(i => i.kind === 'illustration')).toBe(true);
    expect(library.search('   ')).toEqual([]);
  });
  it('bundles no asset left out for content (knife poses)', () => {
    const {library} = setup();
    expect(library.find('peeps:peep-77')).toBeUndefined();
    expect(library.state().bundled.map(b => b.count)).toEqual([expect.any(Number), 91]);
  });
  it('bakes a color into icons before rasterizing and keeps the aspect ratio', async () => {
    const {library, rasterized} = setup();
    const asset = await library.asPoolAsset(library.search('users')[0]!);
    expect(rasterized[0]).not.toContain('currentColor');
    expect(asset.id).toBe(libraryAssetId('lucide:users'));
    expect(asset.h / asset.w).toBeCloseTo(0.5, 1);
    expect(asset.source.kind).toBe('library');
    expect(asset.source.library?.credit).toBeUndefined();
  });
  it('keeps imported images out of search until their terms are recorded', () => {
    const {library, dataDir} = setup();
    const file = join(dataDir, 'shot.png'); writeFileSync(file, Buffer.from(png.split(',')[1]!, 'base64'));
    const item = library.importFile(file);
    expect(library.update(item.key, {description: '予約画面のスクリーンショット', tags: ['予約']})).toEqual([]);
    expect(library.search('予約', {limit: 1000}).map(i => i.key)).not.toContain(item.key);
    const license = {name: '自作', sourceUrl: 'https://example.com/shot', status: 'confirmed' as const, creditRequired: true};
    expect(library.update(item.key, {license}).join()).toContain('表記する文');
    expect(library.update(item.key, {license: {...license, creditText: '© Example'}})).toEqual([]);
    expect(library.search('予約').map(i => i.key)).toContain(item.key);
    expect(() => library.importFile(join(dataDir, 'note.txt'))).toThrow();
    library.remove(item.key);
    expect(library.state().imported).toEqual([]);
  });
  it('carries the credit with the asset so adoption can write it', async () => {
    const {library, dataDir} = setup();
    const file = join(dataDir, 'art.png'); writeFileSync(file, Buffer.from(png.split(',')[1]!, 'base64'));
    const item = library.importFile(file);
    library.update(item.key, {description: '人物', tags: ['人物'], license: {name: 'Freepik License', sourceUrl: 'https://www.freepik.com/x', status: 'confirmed', creditRequired: true, creditText: 'Designed by Freepik', nearUse: true, limitNote: '1日3点まで'}});
    const asset = await library.asPoolAsset(library.find(item.key)!);
    expect(asset.source.library).toMatchObject({credit: 'Designed by Freepik', nearUse: true, limitNote: '1日3点まで'});
  });
});

describe('credits page', () => {
  const size = {width: 9144000, height: 5143500};
  it('creates the page at the end when there is none', () => {
    const r = creditPageRequests({existing: null, lines: ['人物：Designed by Freepik'], size});
    expect(r[0]).toEqual({createSlide: {objectId: CREDITS_PAGE, slideLayoutReference: {predefinedLayout: 'BLANK'}}});
    expect(JSON.stringify(r)).toContain('Designed by Freepik');
  });
  it('merges lines into the existing text and skips when nothing is new', () => {
    const r = creditPageRequests({existing: '手で書いた出典\n人物：Designed by Freepik\n', lines: ['人物：Designed by Freepik', '写真：© Example'], size});
    expect(r[0]).toEqual({deleteText: {objectId: CREDITS_BODY, textRange: {type: 'ALL'}}});
    expect(r[1]).toEqual({insertText: {objectId: CREDITS_BODY, text: '手で書いた出典\n人物：Designed by Freepik\n写真：© Example', insertionIndex: 0}});
    expect(creditPageRequests({existing: '人物：Designed by Freepik\n', lines: ['人物：Designed by Freepik'], size})).toEqual([]);
  });
});
