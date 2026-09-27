// The credits page at the end of the deck. Slipper owns it by object id: the only existing page
// Slipper ever edits. Lines are merged, so credits added earlier (or by hand) are kept.
import {EMU_PER_PT, toEmu, type PageSize} from '@shared/geometry';
import type {ApiPage} from './google/convert';

export const CREDITS_PAGE = 'slpcredits';
export const CREDITS_TITLE = 'slpcredits_title';
export const CREDITS_BODY = 'slpcredits_body';

export function creditsText(page: ApiPage | null): string | null {
  const body = page?.pageElements?.find(e => e.objectId === CREDITS_BODY);
  if (!body) return null;
  return (body.shape?.text?.textElements ?? []).map(t => t.textRun?.content ?? '').join('');
}

const box = (id: string, size: PageSize, x: number, y: number, w: number, h: number) => ({createShape: {objectId: id, shapeType: 'TEXT_BOX', elementProperties: {pageObjectId: CREDITS_PAGE,
  size: {width: {magnitude: toEmu(w, size), unit: 'EMU'}, height: {magnitude: toEmu(h, size), unit: 'EMU'}},
  transform: {scaleX: 1, scaleY: 1, translateX: toEmu(x, size), translateY: toEmu(y, size), unit: 'EMU'}}}});
const style = (id: string, px: number, bold: boolean, size: PageSize) => ({updateTextStyle: {objectId: id, textRange: {type: 'ALL'}, fields: 'fontSize,bold',
  style: {fontSize: {magnitude: Math.round(toEmu(px, size) / EMU_PER_PT * 10) / 10, unit: 'PT'}, bold}}});

// existing: the body text of the current credits page, or null when there is none yet.
export function creditPageRequests(opts: {existing: string | null; lines: string[]; size: PageSize}): object[] {
  const current = (opts.existing ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  const merged = [...current, ...opts.lines.map(l => l.trim()).filter(l => l && !current.includes(l))].filter((l, i, a) => a.indexOf(l) === i);
  if (opts.existing !== null && merged.length === current.length) return [];
  const text = merged.join('\n');
  if (opts.existing === null) return [
    {createSlide: {objectId: CREDITS_PAGE, slideLayoutReference: {predefinedLayout: 'BLANK'}}},
    box(CREDITS_TITLE, opts.size, 64, 48, 832, 60), {insertText: {objectId: CREDITS_TITLE, text: 'クレジット', insertionIndex: 0}}, style(CREDITS_TITLE, 32, true, opts.size),
    box(CREDITS_BODY, opts.size, 64, 128, 832, 360), {insertText: {objectId: CREDITS_BODY, text, insertionIndex: 0}}, style(CREDITS_BODY, 16, false, opts.size)
  ];
  return [{deleteText: {objectId: CREDITS_BODY, textRange: {type: 'ALL'}}}, {insertText: {objectId: CREDITS_BODY, text, insertionIndex: 0}}, style(CREDITS_BODY, 16, false, opts.size)];
}
