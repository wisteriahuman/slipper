// The app-wide asset library. Bundled assets are open-license and read from their packages;
// imported files are copied into the app's data directory. Only confirmed items are searchable.
import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {licenseProblems, type LibraryItem, type LibraryPatch, type LibraryState} from '@shared/library';
import type {PoolAsset} from '@shared/asset-pool';
import type {Store} from './store';
import {EN_TO_EN, JA_TO_EN} from './library-words';

// Renders SVG markup to a PNG data URL at the given width (transparent background).
export type Rasterize = (svg: string, width: number) => Promise<string>;
// Shrinks an image data URL for the panel list.
export type Shrink = (dataUrl: string, width: number) => string;
type Entry = LibraryItem & {file: string; mime: string; addedAt?: number};

export const libraryAssetId = (key: string) => `lib_${createHash('sha256').update(key).digest('hex').slice(0, 20)}`;
const IMPORT_TYPES: Record<string, string> = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml'};
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
// Lucide draws with currentColor; icons are written back as images, so a neutral dark is baked in.
const ICON_COLOR = '#3c4043';

export class Library {
  private bundled: Entry[] | null = null;
  private previews = new Map<string, string>();
  private images = new Map<string, {dataUrl: string; width: number; height: number}>();
  readonly dir: string;

  constructor(private deps: {store: Store; dataDir: string; lucideDir: string; peepsDir: string; rasterize: Rasterize; shrink: Shrink}) {
    this.dir = path.join(deps.dataDir, 'library');
  }

  private loadBundled(): Entry[] {
    if (this.bundled) return this.bundled;
    const lucide = {name: 'ISC（Lucide）', sourceUrl: 'https://lucide.dev/license', status: 'confirmed' as const, creditRequired: false};
    const tags = JSON.parse(fs.readFileSync(path.join(this.deps.lucideDir, 'tags.json'), 'utf8')) as Record<string, string[]>;
    const icons: Entry[] = Object.entries(tags).filter(([name]) => fs.existsSync(path.join(this.deps.lucideDir, 'icons', `${name}.svg`))).map(([name, t]) => ({
      key: `lucide:${name}`, kind: 'icon', title: name.replace(/-/g, ' '), description: `アイコン「${name}」`, tags: t, license: lucide,
      file: path.join(this.deps.lucideDir, 'icons', `${name}.svg`), mime: 'image/svg+xml'}));
    const peeps = JSON.parse(fs.readFileSync(path.join(this.deps.peepsDir, 'index.json'), 'utf8')) as {license: string; licenseUrl: string; items: Array<{file: string; title: string; description: string; tags: string[]}>};
    const people: Entry[] = peeps.items.map(p => ({
      key: `peeps:${p.file.replace(/\.svg$/, '')}`, kind: 'illustration', title: p.title, description: p.description, tags: p.tags,
      license: {name: `${peeps.license}（Open Peeps）`, sourceUrl: peeps.licenseUrl, status: 'confirmed', creditRequired: false},
      file: path.join(this.deps.peepsDir, p.file), mime: 'image/svg+xml'}));
    return this.bundled = [...icons, ...people];
  }

  private imported(): Entry[] {
    return this.deps.store.libraryItems().map(i => ({...i, file: path.join(this.dir, i.file)}));
  }

  private all(): Entry[] { return [...this.loadBundled(), ...this.imported()]; }

  // Each query word becomes a group of terms (itself plus English expansions of Japanese words); an item
  // scores the best match per group, summed over groups, so synonyms of one word do not add up.
  // Exact icon names beat tags, and simple names beat compound ones (search over folder-search).
  search(query: string, opts: {kind?: LibraryItem['kind']; limit?: number} = {}): LibraryItem[] {
    const groups = queryGroups(query);
    if (!groups.length) return [];
    const scored = this.all().filter(i => i.license.status === 'confirmed' && (!opts.kind || i.kind === opts.kind)).map(item => ({item, score: scoreItem(item, groups)})).filter(x => x.score > 0);
    scored.sort((a, b) => b.score - a.score || a.item.key.length - b.item.key.length);
    return scored.slice(0, opts.limit ?? 12).map(({item: {file: _f, mime: _m, addedAt: _a, ...rest}}) => rest);
  }

  find(key: string): Entry | undefined { return this.all().find(i => i.key === key); }

  // A PNG (or the imported raster file) with its size, as the AI, the preview and Google receive it.
  async image(key: string): Promise<{dataUrl: string; width: number; height: number}> {
    const cached = this.images.get(key);
    if (cached) return cached;
    const item = this.find(key);
    if (!item) throw new Error('素材が見つかりません');
    const bytes = fs.readFileSync(item.file);
    let dataUrl: string;
    if (item.mime === 'image/svg+xml') {
      let svg = bytes.toString('utf8');
      if (item.kind === 'icon') svg = svg.replace(/currentColor/g, ICON_COLOR);
      dataUrl = await this.deps.rasterize(svg, item.kind === 'icon' ? 256 : 640);
    } else dataUrl = `data:${item.mime};base64,${bytes.toString('base64')}`;
    const size = pngSize(dataUrl) ?? jpegSize(dataUrl) ?? gifSize(dataUrl) ?? {width: 1, height: 1};
    const result = {dataUrl, ...size};
    this.images.set(key, result);
    return result;
  }

  async asPoolAsset(item: LibraryItem): Promise<PoolAsset> {
    const img = await this.image(item.key);
    const w = item.kind === 'icon' ? 96 : 240;
    const entry = this.find(item.key);
    const svg = item.kind === 'icon' && entry?.mime === 'image/svg+xml' ? fs.readFileSync(entry.file, 'utf8') : undefined;
    const l = item.license;
    return {id: libraryAssetId(item.key), kind: item.kind, description: `${item.title}：${item.description}`, x: 0, y: 0, w, h: Math.round(w * img.height / img.width), previewUrl: img.dataUrl, ...(svg ? {svg} : {}),
      source: {pageId: '', kind: 'library', fingerprint: createHash('sha256').update(img.dataUrl).digest('hex'), context: `共通素材（${l.name}）`,
        library: {key: item.key, title: item.title, ...(l.creditRequired && l.creditText ? {credit: l.creditText, nearUse: !!l.nearUse} : {}), ...(l.limitNote ? {limitNote: l.limitNote} : {})}}};
  }

  // An icon drawn in a theme color, as Google Slides receives it.
  recolor(svg: string, hex: string): Promise<string> { return this.deps.rasterize(svg.replace(/currentColor/g, hex), 256); }

  // --- Imported items ----------------------------------------------------------------------

  importFile(source: string): LibraryItem {
    const ext = path.extname(source).toLowerCase();
    const mime = IMPORT_TYPES[ext];
    if (!mime) throw new Error('PNG・JPEG・GIF・SVG の画像を選んでください');
    if (fs.statSync(source).size > MAX_IMPORT_BYTES) throw new Error('画像は20MB以下にしてください');
    fs.mkdirSync(this.dir, {recursive: true});
    const id = randomUUID(), file = `${id}${ext}`;
    fs.copyFileSync(source, path.join(this.dir, file));
    const item: LibraryItem = {key: `user:${id}`, kind: 'illustration', title: path.basename(source, ext), description: '', tags: [],
      license: {name: '', sourceUrl: '', status: 'unconfirmed', creditRequired: false}};
    this.deps.store.saveLibraryItem(item, file, mime);
    return item;
  }

  update(key: string, patch: LibraryPatch): string[] {
    const current = this.deps.store.libraryItems().find(i => i.key === key);
    if (!current) return ['取り込んだ素材が見つかりません'];
    const {file, mime, addedAt: _a, ...item} = current;
    const next: LibraryItem = {...item, ...patch, license: {...item.license, ...patch.license}};
    if (next.license.status === 'confirmed') {
      const problems = [...licenseProblems(next.license), ...(next.description.trim() ? [] : ['何が写っているかの説明を書いてください（AI が選ぶときに使います）'])];
      if (problems.length) return problems;
    }
    this.deps.store.saveLibraryItem(next, file, mime);
    this.images.delete(key);
    return [];
  }

  remove(key: string) {
    const current = this.deps.store.libraryItems().find(i => i.key === key);
    if (!current) return;
    this.deps.store.removeLibraryItem(key);
    fs.rmSync(path.join(this.dir, current.file), {force: true});
    this.images.delete(key); this.previews.delete(key);
  }

  private preview(i: Entry): string | undefined {
    if (!this.previews.has(i.key)) {
      try {
        const raw = `data:${i.mime};base64,${fs.readFileSync(i.file).toString('base64')}`;
        this.previews.set(i.key, i.mime === 'image/svg+xml' ? raw : this.deps.shrink(raw, 192));
      } catch { return undefined; }
    }
    return this.previews.get(i.key);
  }

  state(): LibraryState {
    const bundled = this.loadBundled();
    const count = (prefix: string) => bundled.filter(b => b.key.startsWith(prefix)).length;
    return {
      imported: this.imported().map(i => ({key: i.key, kind: i.kind, title: i.title, description: i.description, tags: i.tags, license: i.license, addedAt: i.addedAt ?? 0,
        previewUrl: this.preview(i)})),
      bundled: [
        {name: 'Lucide（アイコン）', license: 'ISC', count: count('lucide:'), sourceUrl: 'https://lucide.dev/'},
        {name: 'Open Peeps（人物イラスト）', license: 'CC0 1.0', count: count('peeps:'), sourceUrl: 'https://www.openpeeps.com/'}
      ]
    };
  }
}

function gifSize(dataUrl: string) {
  const m = /^data:image\/gif;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const b = Buffer.from(m[1]!.slice(0, 16), 'base64');
  return b.length >= 10 ? {width: b.readUInt16LE(6), height: b.readUInt16LE(8)} : null;
}

function pngSize(dataUrl: string) {
  const m = /^data:image\/png;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const b = Buffer.from(m[1]!.slice(0, 64), 'base64');
  return b.length >= 24 ? {width: b.readUInt32BE(16), height: b.readUInt32BE(20)} : null;
}

// Walks JPEG segments to the start-of-frame marker, which holds the size.
function jpegSize(dataUrl: string) {
  const m = /^data:image\/jpeg;base64,(.*)$/.exec(dataUrl);
  if (!m) return null;
  const b = Buffer.from(m[1]!, 'base64');
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return {width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5)};
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

const JA_KEYS = Object.keys(JA_TO_EN).sort((a, b) => b.length - a.length);
type Term = {term: string; weight: number};

export function queryGroups(query: string): Term[][] {
  return query.toLowerCase().split(/[\s,、，。]+/).filter(Boolean).map(word => {
    const terms: Term[] = [{term: word, weight: 1}, ...(EN_TO_EN[word] ?? []).map(t => ({term: t, weight: 0.9}))];
    // Japanese words are matched inside longer words too: 参加人数 → 人数, 人.
    // A longer match consumes its part, so 車いす does not also match 車.
    let rest = word;
    for (const key of JA_KEYS) {
      if (!rest.includes(key.toLowerCase())) continue;
      rest = rest.replace(key.toLowerCase(), ' ');
      terms.push({term: key, weight: word === key ? 1 : 0.8}, ...JA_TO_EN[key]!.map(t => ({term: t.toLowerCase(), weight: word === key ? 0.9 : 0.7})));
    }
    return terms;
  });
}

function scoreItem(item: LibraryItem, groups: Term[][]): number {
  const name = item.key.startsWith('lucide:') ? item.key.slice('lucide:'.length) : item.title.toLowerCase();
  const tokens = name.split(/[-\s]+/);
  const tags = item.tags.map(t => t.toLowerCase());
  const tagWords = tags.flatMap(t => t.split(/\s+/));
  const text = `${item.title} ${item.description}`.toLowerCase();
  // Items described in Japanese have no English name to match, so their own tags count like a name.
  const described = !item.key.startsWith('lucide:');
  const match = (t: string) =>
    name === t ? 10 :
    described && tags.includes(t) ? 9 :
    described && t.length >= 2 && /[^\x00-\x7f]/.test(t) && text.includes(t) ? 5 :
    t.includes('-') && (name.startsWith(`${t}-`) || name.endsWith(`-${t}`)) ? 5 :
    tokens.includes(t) ? 6 :
    tags.includes(t) ? 4 :
    tagWords.includes(t) ? 3 :
    t.length >= 2 && /[^\x00-\x7f]/.test(t) && text.includes(t) ? 3 :
    t.length >= 4 && (name.includes(t) || tags.some(g => g.includes(t))) ? 1 : 0;
  const score = groups.reduce((sum, terms) => sum + Math.max(...terms.map(({term, weight}) => match(term) * weight)), 0);
  return score > 0 ? score - (described ? 0 : 0.4 * (tokens.length - 1)) : 0;
}
