// Turns an adopted storyline into batchUpdate requests on a Drive copy of the deck.
// The original deck is never touched. Pure functions, so they can be tested with fixtures.
import type {Storyline} from '@shared/storyline';

export type CopySlides = {originalIds: string[]; copyIds: string[]};
export type Layout = {objectId: string; name?: string};

// Right after a Drive copy the slide order is identical, so pages are matched by position rather
// than trusting that object ids survive the copy.
export function mapByPosition({originalIds, copyIds}: CopySlides): Map<string, string> {
  if (originalIds.length !== copyIds.length) throw new Error('複製した資料のページ数が元と一致しません');
  return new Map(originalIds.map((id, i) => [id, copyIds[i]!]));
}

// New pages use the deck's blank layout when there is one, otherwise the layout of a kept page.
export function pickLayout(layouts: Layout[], fallbackLayoutId: string | undefined): string | undefined {
  return layouts.find(l => l.name === 'BLANK')?.objectId ?? fallbackLayoutId;
}

export type StructurePlan = {
  requests: object[];
  // Final page ids in the copy, one per storyline slide, in order.
  order: string[];
};

// Phase 1: create, duplicate, delete and reorder pages. Notes are added in phase 2, once the new
// pages exist and their speaker-notes shapes can be looked up.
export function planStructure(opts: {storyline: Storyline; idMap: Map<string, string>; layoutId: string | undefined; idPrefix: string}): StructurePlan {
  const {storyline, idMap, layoutId, idPrefix} = opts;
  const requests: object[] = [];
  const order: string[] = [];
  const used = new Set<string>();
  storyline.slides.forEach((slide, i) => {
    if (slide.source.kind === 'new') {
      const id = `${idPrefix}_s${i}`;
      requests.push({createSlide: {objectId: id, ...(layoutId ? {slideLayoutReference: {layoutId}} : {})}});
      order.push(id);
      return;
    }
    const originalId = slide.source.kind === 'keep' ? slide.source.pageId : slide.source.pageIds[0]!;
    const copyId = idMap.get(originalId);
    if (!copyId) throw new Error(`元のページが見つかりません: ${originalId}`);
    if (!used.has(copyId)) { used.add(copyId); order.push(copyId); return; }
    // The same original used twice: duplicate it.
    const dupId = `${idPrefix}_d${i}`;
    requests.push({duplicateObject: {objectId: copyId, objectIds: {[copyId]: dupId}}});
    order.push(dupId);
  });
  for (const copyId of idMap.values()) if (!used.has(copyId)) requests.push({deleteObject: {objectId: copyId}});
  // Moving each page to its index in turn yields the storyline order.
  order.forEach((id, index) => requests.push({updateSlidesPosition: {slideObjectIds: [id], insertionIndex: index}}));
  return {requests, order};
}

// Phase 2: write each page's role and note into its speaker notes, and put a visible label on new
// pages so they are easy to spot in the editor. Labels use the slp_note prefix so Slipper ignores
// them when reading the page as content.
export const NOTE_PREFIX = 'slp_note';

export function planNotes(opts: {storyline: Storyline; order: string[]; speakerNotesIds: Map<string, string>; idPrefix: string}): object[] {
  const requests: object[] = [];
  opts.storyline.slides.forEach((slide, i) => {
    const pageId = opts.order[i]!;
    const merged = slide.source.kind === 'merge' ? `\n（元の ${slide.source.pageIds.length} ページの内容をまとめる）` : '';
    const text = `【Slipper 流れの案】${i + 1}. ${slide.role}${slide.note ? `\n見せること: ${slide.note}` : ''}${merged}`;
    const notesId = opts.speakerNotesIds.get(pageId);
    if (notesId) requests.push({insertText: {objectId: notesId, text, insertionIndex: 0}});
    if (slide.source.kind === 'new') {
      const objectId = `${NOTE_PREFIX}_${opts.idPrefix}_${i}`;
      requests.push({createShape: {objectId, shapeType: 'TEXT_BOX', elementProperties: {pageObjectId: pageId,
        size: {width: {magnitude: 6000000, unit: 'EMU'}, height: {magnitude: 900000, unit: 'EMU'}},
        transform: {scaleX: 1, scaleY: 1, translateX: 600000, translateY: 2100000, unit: 'EMU'}}}});
      requests.push({insertText: {objectId, text: `（新しく作るページ）${slide.role}\n${slide.note}`, insertionIndex: 0}});
    }
  });
  return requests;
}
