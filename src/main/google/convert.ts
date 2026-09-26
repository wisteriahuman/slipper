// Pure conversions between the Google Slides API shapes and Slipper's elements.
// Kept free of network code so they can be tested with fixtures.
import type {SlideElement} from '@shared/element';
import {EMU_PER_PT, fromEmu, toEmu, type PageSize} from '@shared/geometry';
import type {Palette} from '@shared/palette';
import {NOTE_PREFIX} from './storyline-build';

// Minimal typings for the parts of the Slides API we read.
type Dimension = {magnitude?: number; unit?: 'EMU' | 'PT'};
type Transform = {scaleX?: number; scaleY?: number; shearX?: number; shearY?: number; translateX?: number; translateY?: number; unit?: 'EMU' | 'PT'};
type TextElement = {textRun?: {content?: string; style?: {fontSize?: Dimension; bold?: boolean}}};
type ApiColor = {rgbColor?: {red?: number; green?: number; blue?: number}; themeColor?: string};
type SolidFill = {solidFill?: {color?: ApiColor}};
export type ApiPageElement = {
  objectId: string; title?: string; description?: string;
  size?: {width?: Dimension; height?: Dimension}; transform?: Transform;
  shape?: {shapeType?: string; placeholder?: {type?: string}; text?: {textElements?: TextElement[]}; shapeProperties?: {shapeBackgroundFill?: SolidFill}};
  image?: {contentUrl?: string}; table?: {tableRows?: Array<{tableCells?: Array<{text?: {textElements?: TextElement[]}}>}>};
  sheetsChart?: unknown; video?: unknown; line?: {lineCategory?: string; lineType?: string; lineProperties?: {lineFill?: SolidFill; weight?: Dimension}};
  elementGroup?: {children?: ApiPageElement[]}; wordArt?: unknown;
};
export type ApiPage = {objectId: string; pageElements?: ApiPageElement[]; pageProperties?: {colorScheme?: ApiColorScheme}};
export type ApiColorScheme = {colors?: Array<{type?: string; color?: {red?: number; green?: number; blue?: number}}>};

export type PageText = {id: string; text: string; x: number; y: number; w: number; h: number; size: number | null; bold: boolean};
export type PageAsset = {id: string; kind: 'image' | 'table' | 'chart' | 'video' | 'group' | 'shape' | 'line' | 'other'; description: string; x: number; y: number; w: number; h: number; contentUrl?: string};
export type PageContent = {pageId: string; texts: PageText[]; assets: PageAsset[]};

const emu = (d: Dimension | undefined) => (d?.magnitude ?? 0) * (d?.unit === 'PT' ? EMU_PER_PT : 1);

// Slides transforms are affine matrices. Fields equal to 0 are omitted from API responses, so a
// missing scaleX means 0 (rotated shapes are expressed through shear with zero scale), while a
// missing transform means identity.
type Matrix = {a: number; b: number; c: number; d: number; tx: number; ty: number};
const IDENTITY: Matrix = {a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0};

function toMatrix(t: Transform | undefined): Matrix {
  if (!t) return IDENTITY;
  const unit = t.unit === 'PT' ? EMU_PER_PT : 1;
  return {a: t.scaleX ?? 0, b: t.shearX ?? 0, c: t.shearY ?? 0, d: t.scaleY ?? 0, tx: (t.translateX ?? 0) * unit, ty: (t.translateY ?? 0) * unit};
}

// Elements inside a group are positioned relative to the group: absolute = parent × child.
const multiply = (p: Matrix, c: Matrix): Matrix => ({
  a: p.a * c.a + p.b * c.c, b: p.a * c.b + p.b * c.d,
  c: p.c * c.a + p.d * c.c, d: p.c * c.b + p.d * c.d,
  tx: p.a * c.tx + p.b * c.ty + p.tx, ty: p.c * c.tx + p.d * c.ty + p.ty
});

// Axis-aligned bounding box on the canvas; a rotated element becomes the box around it.
function box(el: ApiPageElement, page: PageSize, parent: Matrix = IDENTITY) {
  const m = multiply(parent, toMatrix(el.transform));
  const w = emu(el.size?.width), h = emu(el.size?.height);
  const xs = [0, w].flatMap(x => [0, h].map(y => m.a * x + m.b * y + m.tx));
  const ys = [0, w].flatMap(x => [0, h].map(y => m.c * x + m.d * y + m.ty));
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return {x: fromEmu(x0, page), y: fromEmu(y0, page), w: fromEmu(x1 - x0, page), h: fromEmu(y1 - y0, page)};
}

const joinText = (parts: TextElement[] | undefined) => (parts ?? []).map(p => p.textRun?.content ?? '').join('').replace(/\n$/, '');

export function toPageContent(page: ApiPage, size: PageSize): PageContent {
  const texts: PageText[] = [], assets: PageAsset[] = [];
  for (const el of page.pageElements ?? []) {
    if (el.objectId.startsWith(NOTE_PREFIX)) continue; // Slipper's own label on pages created from a storyline
    const b = box(el, size);
    if (el.shape) {
      const text = joinText(el.shape.text?.textElements);
      // Shapes without text (dots on a chart, boxes, highlights) are part of the picture: the AI may
      // reuse them, so they are offered as assets rather than dropped.
      if (!text.trim()) { assets.push({id: el.objectId, kind: 'shape', description: `図形: ${el.shape.shapeType ?? '図形'}`, ...b}); continue; }
      const run = el.shape.text?.textElements?.find(t => t.textRun?.style?.fontSize)?.textRun?.style;
      const pt = run?.fontSize?.magnitude;
      texts.push({id: el.objectId, text, ...b, size: pt ? fromEmu(pt * EMU_PER_PT, size) : null, bold: !!run?.bold});
    } else if (el.image) {
      assets.push({id: el.objectId, kind: 'image', description: el.description || el.title || '画像', ...b, contentUrl: el.image.contentUrl});
    } else if (el.table) {
      const cells = (el.table.tableRows ?? []).flatMap(r => (r.tableCells ?? []).map(c => joinText(c.text?.textElements).trim())).filter(Boolean);
      assets.push({id: el.objectId, kind: 'table', description: `表: ${cells.slice(0, 6).join(' / ')}`, ...b});
    } else if (el.sheetsChart) {
      assets.push({id: el.objectId, kind: 'chart', description: el.title || 'グラフ', ...b});
    } else if (el.video) {
      assets.push({id: el.objectId, kind: 'video', description: el.title || '動画', ...b});
    } else if (el.elementGroup) {
      assets.push({id: el.objectId, kind: 'group', description: el.title || 'まとまった図', ...b});
    } else if (el.line) {
      // lineType (e.g. CURVED_CONNECTOR_3) tells curves apart. Hand-drawn freeform lines come back
      // with no type at all, so they are described as free lines whose shape is seen in the image.
      const kind = `${el.line.lineCategory ?? ''} ${el.line.lineType ?? ''}`;
      const description = /CURVED/.test(kind) ? '曲線' : /BENT/.test(kind) ? '折れ線' : /STRAIGHT/.test(kind) ? '直線' : '自由な線（曲線など。形は画像で確かめる）';
      assets.push({id: el.objectId, kind: 'line', description, ...b});
    } else {
      assets.push({id: el.objectId, kind: 'other', description: el.title || '要素', ...b});
    }
  }
  return {pageId: page.objectId, texts, assets};
}

// Decorations that come from the page's layout and master (bands, rules), not from the page itself.
// They stay on the added page, so variants are previewed on top of them and the AI is told where they are.
export type Decoration = {x: number; y: number; w: number; h: number; kind: 'rect' | 'line'; color: string};

const hexOfRgb = (c: {red?: number; green?: number; blue?: number}) => {
  const ch = (v = 0) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${ch(c.red)}${ch(c.green)}${ch(c.blue)}`;
};
const resolveColor = (color: ApiColor | undefined, themeHex: Record<string, string>) =>
  color?.rgbColor ? hexOfRgb(color.rgbColor) : color?.themeColor ? themeHex[color.themeColor] ?? null : null;

export function toDecorations(pages: ApiPage[], size: PageSize, themeHex: Record<string, string>): Decoration[] {
  const out: Decoration[] = [];
  const visit = (el: ApiPageElement, parent: Matrix) => {
    if (el.shape?.placeholder) return; // placeholders are replaced by the page's own content
    if (el.elementGroup) {
      const m = multiply(parent, toMatrix(el.transform));
      for (const child of el.elementGroup.children ?? []) visit(child, m);
      return;
    }
    const b = box(el, size, parent);
    if (el.line) {
      const color = resolveColor(el.line.lineProperties?.lineFill?.solidFill?.color, themeHex);
      if (color) out.push({...b, w: Math.max(b.w, 2), h: Math.max(b.h, 2), kind: 'line', color});
    } else if (el.shape && !joinText(el.shape.text?.textElements).trim()) {
      const color = resolveColor(el.shape.shapeProperties?.shapeBackgroundFill?.solidFill?.color, themeHex);
      if (color) out.push({...b, kind: 'rect', color});
    }
  };
  for (const page of pages) for (const el of page.pageElements ?? []) visit(el, IDENTITY);
  return out;
}

export function toPalette(scheme: ApiColorScheme | undefined, meanings: Palette['meanings']): Palette {
  const hex: Record<string, string> = {};
  for (const c of scheme?.colors ?? []) if (c.type && c.color) hex[c.type] = hexOfRgb(c.color);
  return {hex, meanings};
}

const SHAPE_TYPE = {rect: 'RECTANGLE', roundRect: 'ROUND_RECTANGLE', ellipse: 'ELLIPSE'} as const;

export type WriteBackPlan = {newPageId: string; requests: object[]};

// Builds a batchUpdate that duplicates the original page right after itself, keeps the assets the
// variant uses (moved/resized), removes everything else from the copy, and draws the new text and shapes.
// The original page is never modified.
export function planWriteBack(opts: {page: ApiPage; size: PageSize; elements: SlideElement[]; idPrefix: string}): WriteBackPlan {
  const {page, size, elements, idPrefix} = opts;
  const newPageId = `${idPrefix}_page`;
  const children = page.pageElements ?? [];
  const copyId = new Map(children.map((c, i) => [c.objectId, `${idPrefix}_c${i}`]));
  const requests: object[] = [{duplicateObject: {objectId: page.objectId, objectIds: {[page.objectId]: newPageId, ...Object.fromEntries(copyId)}}}];

  const assetPlacement = new Map<string, SlideElement>();
  for (const e of elements) if (e.type === 'asset' && e.assetId && !assetPlacement.has(e.assetId)) assetPlacement.set(e.assetId, e);

  for (const child of children) {
    const copy = copyId.get(child.objectId)!;
    const target = assetPlacement.get(child.objectId);
    if (!target) { requests.push({deleteObject: {objectId: copy}}); continue; }
    const original = box(child, size), m = toMatrix(child.transform);
    const sx = original.w > 0 ? target.w / original.w : 1;
    const sy = original.h > 0 ? target.h / original.h : 1;
    requests.push({updatePageElementTransform: {objectId: copy, applyMode: 'ABSOLUTE', transform: {
      scaleX: m.a * sx, scaleY: m.d * sy, shearX: m.b * sx, shearY: m.c * sy,
      translateX: toEmu(target.x, size) + sx * (m.tx - toEmu(original.x, size)),
      translateY: toEmu(target.y, size) + sy * (m.ty - toEmu(original.y, size)), unit: 'EMU'
    }}});
  }

  const stacking: string[] = [];
  elements.forEach((e, i) => {
    if (e.type === 'asset') {
      const copy = e.assetId && assetPlacement.get(e.assetId) === e ? copyId.get(e.assetId) : undefined;
      if (copy) stacking.push(copy);
      return;
    }
    const objectId = `${idPrefix}_n${i}`;
    stacking.push(objectId);
    const elementProperties = {pageObjectId: newPageId, size: {width: {magnitude: toEmu(e.w, size), unit: 'EMU'}, height: {magnitude: toEmu(e.h, size), unit: 'EMU'}},
      transform: {scaleX: 1, scaleY: 1, translateX: toEmu(e.x, size), translateY: toEmu(e.y, size), unit: 'EMU'}};
    if (e.type === 'shape' && e.shape === 'line') {
      requests.push({createLine: {objectId, lineCategory: 'STRAIGHT', elementProperties}});
      if (e.fill) requests.push({updateLineProperties: {objectId, lineProperties: {lineFill: {solidFill: {color: {themeColor: e.fill}}}}, fields: 'lineFill'}});
      return;
    }
    const shapeType = e.type === 'text' ? 'TEXT_BOX' : SHAPE_TYPE[e.shape as keyof typeof SHAPE_TYPE] ?? 'RECTANGLE';
    requests.push({createShape: {objectId, shapeType, elementProperties}});
    if (e.type === 'shape') {
      requests.push({updateShapeProperties: {objectId, fields: 'shapeBackgroundFill,outline', shapeProperties: {
        shapeBackgroundFill: e.fill ? {solidFill: {color: {themeColor: e.fill}, alpha: e.opacity ?? 1}} : {propertyState: 'NOT_RENDERED'}, outline: {propertyState: 'NOT_RENDERED'}}}});
      return;
    }
    if (!e.text) return;
    requests.push({insertText: {objectId, text: e.text, insertionIndex: 0}});
    // The font is left to the deck's theme; only size, weight and color come from the variant.
    requests.push({updateTextStyle: {objectId, textRange: {type: 'ALL'}, fields: 'fontSize,bold,foregroundColor', style: {
      fontSize: {magnitude: Math.round(toEmu(e.size ?? 18, size) / EMU_PER_PT * 10) / 10, unit: 'PT'}, bold: !!e.bold,
      foregroundColor: {opaqueColor: {themeColor: e.color ?? 'DARK1'}}}}});
  });
  // Kept assets sit at the bottom of the copy and new objects land on top, so an image placed inside
  // a panel would be hidden. Bringing each element to the front in the variant's order reproduces
  // the stacking seen in the preview.
  for (const id of stacking) requests.push({updatePageElementsZOrder: {pageElementObjectIds: [id], operation: 'BRING_TO_FRONT'}});
  return {newPageId, requests};
}


// A sequence becomes consecutive pages right after the original. duplicateObject always inserts the
// copy directly after the original, so the last slide is built first and each earlier one lands in
// front of it: original, 1, 2, 3.
export function planSequence(opts: {page: ApiPage; size: PageSize; frames: SlideElement[][]; idPrefix: string}): {newPageIds: string[]; requests: object[]} {
  const plans = opts.frames.map((elements, i) => planWriteBack({page: opts.page, size: opts.size, elements, idPrefix: `${opts.idPrefix}f${i}`}));
  return {newPageIds: plans.map(p => p.newPageId), requests: [...plans].reverse().flatMap(p => p.requests)};
}

// A page "continues" the previous one when it keeps most of that page's text and assets in the same
// place and adds to it: a build-up, a highlight, a covering statement. Such pairs are deliberate
// sequences, not duplicates, and must not be merged away.
const NEAR = 4;
const samePlace = (a: {x: number; y: number; w: number; h: number}, b: {x: number; y: number; w: number; h: number}) =>
  Math.abs(a.x - b.x) <= NEAR && Math.abs(a.y - b.y) <= NEAR && Math.abs(a.w - b.w) <= NEAR && Math.abs(a.h - b.h) <= NEAR;

export function continuesPrevious(prev: PageContent, next: PageContent): boolean {
  const total = prev.texts.length + prev.assets.length;
  if (total === 0) return false;
  const keptTexts = prev.texts.filter(t => next.texts.some(u => u.text === t.text && samePlace(t, u))).length;
  const keptAssets = prev.assets.filter(a => next.assets.some(b => b.kind === a.kind && samePlace(a, b))).length;
  return (keptTexts + keptAssets) / total >= 0.8;
}
