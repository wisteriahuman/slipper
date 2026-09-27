import {describe, expect, it, vi} from 'vitest';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveEditor, liveElements, planLiveEdit, textRequests} from '../src/main/live-edit';
import {arrangeElements, resolveConflicts, type LivePage} from '../src/shared/live-edit';
import type {ApiPage} from '../src/main/google/convert';

const size = {width: 960 * 9525, height: 540 * 9525};
const page = (): ApiPage => ({objectId: 'page', pageElements: [
  {objectId: 'text', size: {width: {magnitude: 300 * 9525}, height: {magnitude: 60 * 9525}}, transform: {scaleX: 1, scaleY: 1, translateX: 40 * 9525, translateY: 80 * 9525, unit: 'EMU'}, shape: {shapeType: 'TEXT_BOX', text: {textElements: [{textRun: {content: '30人を対象に2週間試行\n', style: {bold: true}}}]}}},
  {objectId: 'image', size: {width: {magnitude: 100 * 9525}, height: {magnitude: 100 * 9525}}, transform: {scaleX: 1, scaleY: 1, translateX: 600 * 9525, translateY: 100 * 9525, unit: 'EMU'}, image: {contentUrl: 'https://example.test/image'}}
]});
const source = (p = page(), revisionId = 'r1') => ({page: p, size, revisionId});
const box = {x: 40, y: 80, w: 300, h: 60};
function changedText(p: ApiPage, text: string) { p.pageElements![0]!.shape!.text!.textElements = [{textRun: {content: `${text}\n`}}]; return p; }
function fixture() {
  let current = source();
  const slides = {
    editingPage: vi.fn(async () => structuredClone(current)),
    thumbnail: vi.fn(async () => 'data:image/png;base64,AA=='),
    batchUpdate: vi.fn(async (_id: string, _requests: object[], revision?: string) => { expect(revision).toBe(current.revisionId); return {}; })
  };
  return {slides, editor: new LiveEditor(slides), set: (next: typeof current) => { current = next; }};
}

describe('native edits preserve collaborators and native objects', () => {
  it('moves a native text shape without reverting a collaborator’s text edit', () => {
    const current = source(changedText(page(), '対象は40人に変更'), 'r2');
    const plan = planLiveEdit(source(), current, [{id: 'text', box: {...box, x: 120}}]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]).toMatchObject({updatePageElementTransform: {objectId: 'text', applyMode: 'ABSOLUTE'}});
    expect(plan.expected.page.pageElements![0]!.shape!.text!.textElements![0]!.textRun!.content).toBe('対象は40人に変更\n');
    expect(plan.expected.page.pageElements![1]).toEqual(current.page.pageElements![1]);
  });
  it('changes text while preserving a collaborator’s new position and formatting elsewhere', () => {
    const current = source(); current.page.pageElements![0]!.transform!.translateY = 900;
    const plan = planLiveEdit(source(), current, [{id: 'text', text: '30人で2週間試行'}]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.requests).toEqual([{deleteText: {objectId: 'text', textRange: {type: 'FIXED_RANGE', startIndex: 3, endIndex: 7}}}, {insertText: {objectId: 'text', insertionIndex: 3, text: 'で'}}]);
    expect(plan.expected.page.pageElements![0]!.transform!.translateY).toBe(900);
  });
  it('reports every conflicting field and deletion before writing anything', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    f.set(source(changedText({...page(), pageElements: [page().pageElements![0]!]}, '他の人の文章'), 'r2'));
    const result = await f.editor.apply({snapshotId: base.snapshotId, patches: [{id: 'text', text: '自分の文章'}, {id: 'image', box: {...box}}]});
    expect(result.ok).toBe(false);
    expect(result.conflicts?.map(c => c.field)).toEqual(['text', 'deleted']);
    expect(f.slides.batchUpdate).not.toHaveBeenCalled();
  });
  it('detects rotation changes even if the element keeps its bounding box', () => {
    const current = source(); current.page.pageElements![0]!.transform = {scaleX: -1, scaleY: -1, translateX: 340 * 9525, translateY: 140 * 9525, unit: 'EMU'};
    expect(liveElements(current.page, size)[0]!.box).toEqual(box);
    expect(planLiveEdit(source(), current, [{id: 'text', box: {...box, x: 200}}]).conflicts[0]?.field).toBe('box');
  });
  it('preserves rotation and reflection when moving and scaling', () => {
    const src = source(); src.page.pageElements![0]!.transform = {shearX: -1, shearY: 1, translateX: 100 * 9525, translateY: 80 * 9525, unit: 'EMU'};
    const b = liveElements(src.page, size)[0]!.box;
    const plan = planLiveEdit(src, src, [{id: 'text', box: {...b, x: 20, y: 30, w: b.w * 2, h: b.h * 2}}]);
    const actual = liveElements(plan.expected.page, size)[0]!.box;
    expect(actual).toEqual({x: 20, y: 30, w: 120, h: 600});
  });
  it('does not expand groups or replace tables with images', () => {
    const src = source({objectId: 'page', pageElements: [{...page().pageElements![0]!, shape: undefined, elementGroup: {children: page().pageElements}}]});
    expect(liveElements(src.page, size)[0]!.movable).toBe(false);
    expect(() => planLiveEdit(src, src, [{id: 'text', box: {...box, x: 2}}])).toThrow();
  });
  it('rejects page-size changes and unknown element IDs', () => {
    expect(() => planLiveEdit(source(), {...source(), size: {width: 100, height: 100}}, [{id: 'text', text: 'x'}])).toThrow(/サイズ/);
    expect(() => planLiveEdit(source(), source(), [{id: 'foreign', text: 'x'}])).toThrow(/存在/);
  });
  it('uses the latest revision and never retries a failed write unconditionally', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    f.set(source(page(), 'r2'));
    f.slides.batchUpdate.mockRejectedValueOnce(new Error('revision changed'));
    const result = await f.editor.apply({snapshotId: base.snapshotId, patches: [{id: 'text', text: '新しい文章'}]});
    expect(result.ok).toBe(false);
    expect(f.slides.batchUpdate).toHaveBeenCalledTimes(1);
    expect(f.slides.batchUpdate.mock.calls[0]![2]).toBe('r2');
  });
  it('prevents an undo from erasing a subsequent edit by another person', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    const applied = await f.editor.apply({snapshotId: base.snapshotId, patches: [{id: 'text', text: '新しい文章'}]});
    f.set(source(changedText(page(), 'さらに他の人が直した文章'), 'r3'));
    const undo = await f.editor.undo(applied.undoId!);
    expect(undo.ok).toBe(false);
    expect(undo.message).toContain('取り消しませんでした');
    expect(f.slides.batchUpdate).toHaveBeenCalledTimes(1);
  });
  it('keeps a successful write successful if fetching the result fails', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    f.slides.editingPage.mockResolvedValueOnce(source()).mockRejectedValueOnce(new Error('offline'));
    const result = await f.editor.apply({snapshotId: base.snapshotId, patches: [{id: 'text', text: '新しい文章'}]});
    expect(result.ok).toBe(true); expect(result.undoId).toBeTruthy();
    expect(result.page!.elements[0]!.text).toBe('新しい文章');
  });
  it('avoids writes when another editor already made the same text change', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    f.set(source(changedText(page(), '同じ変更'), 'r2'));
    expect((await f.editor.apply({snapshotId: base.snapshotId, patches: [{id: 'text', text: '同じ変更'}]})).ok).toBe(true);
    expect(f.slides.batchUpdate).not.toHaveBeenCalled();
  });
  it('polls without retrieving another thumbnail when content has not changed', async () => {
    const f = fixture(), base = (await f.editor.read('deck', 'page'))!;
    f.set(source(page(), 'new-deck-revision'));
    expect(await f.editor.read('deck', 'page', base.version)).toBeNull();
    expect(f.slides.thumbnail).toHaveBeenCalledTimes(1);
  });
  it('restores a draft after restart with its original conflict baseline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'slipper-draft-test-'));
    try {
      const f = fixture(), editor = new LiveEditor(f.slides, dir), base = (await editor.read('deck', 'page'))!;
      editor.saveDraft(base.snapshotId, [{id: 'text', text: '自分の下書き'}]);
      const restarted = new LiveEditor(f.slides, dir), restored = restarted.loadDraft('deck', 'page')!;
      expect(restored.patches[0]!.text).toBe('自分の下書き');
      f.set(source(changedText(page(), '再起動中に他の人が編集'), 'r2'));
      const result = await restarted.apply({snapshotId: restored.base.snapshotId, patches: restored.patches});
      expect(result.conflicts).toHaveLength(1);
      expect(f.slides.batchUpdate).not.toHaveBeenCalled();
      restarted.saveDraft(restored.base.snapshotId, []);
      expect(restarted.loadDraft('deck', 'page')).toBeNull();
    } finally { rmSync(dir, {recursive: true, force: true}); }
  });
});

describe('draft edits and text ranges', () => {
  it('does not split surrogate pairs and keeps the final paragraph newline', () => {
    expect(textRequests('t', 'A😀B', 'A😁B')).toEqual([{deleteText: {objectId: 't', textRange: {type: 'FIXED_RANGE', startIndex: 1, endIndex: 3}}}, {insertText: {objectId: 't', insertionIndex: 1, text: '😁'}}]);
    expect(textRequests('t', 'abc', '')).toEqual([{deleteText: {objectId: 't', textRange: {type: 'FIXED_RANGE', startIndex: 0, endIndex: 3}}}]);
  });
  it('keeps nonconflicting changes while choosing remote text', () => {
    const latest = {elements: liveElements(changedText(page(), '最新の文章'), size)} as LivePage;
    expect(resolveConflicts(latest, [{id: 'text', text: '自分の文章', box: {...box, x: 200}}], {'text:text': 'theirs'})).toEqual([{id: 'text', box: {...box, x: 200}}]);
  });
  it('distributes variable-width elements with equal gaps and keeps outer edges fixed', () => {
    const els = [0, 1, 2].map((n) => ({id: String(n), label: '', kind: '', box: {x: [10, 50, 300][n]!, y: 0, w: [50, 80, 100][n]!, h: 20}, movable: true, resizable: true}));
    const result = arrangeElements(els, [{id: '1', text: 'keep'}], ['0', '1', '2'], 'horizontal');
    expect(result.find(p => p.id === '0')!.box!.x).toBe(10);
    expect(result.find(p => p.id === '1')).toEqual({id: '1', text: 'keep', box: {x: 140, y: 0, w: 80, h: 20}});
    expect(result.find(p => p.id === '2')!.box!.x).toBe(300);
  });
});
