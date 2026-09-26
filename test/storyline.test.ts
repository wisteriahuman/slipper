import {describe, expect, it} from 'vitest';
import {mapByPosition, NOTE_PREFIX, pickLayout, planNotes, planStructure} from '../src/main/google/storyline-build';
import {StorylineInputSchema, validateStoryline, type Storyline} from '@shared/storyline';

const storyline = (slides: Storyline['slides']): Storyline & {fromCurrent: string; technique: string} => ({id: 's1', requestId: 'r', aim: '結論から話す流れ', gaveUp: '背景の説明', fromCurrent: '結論を冒頭に移す', technique: 'scqa', approach: null, receivedAt: 0, slides});

describe('validateStoryline', () => {
  const ctx = {pageIds: ['p1', 'p2', 'p3']};
  it('accepts keep, merge and new pages', () => {
    expect(validateStoryline(storyline([
      {role: '結論を言い切る', source: {kind: 'new'}, note: 'サービスの価値を一文で'},
      {role: '背景と課題', source: {kind: 'merge', pageIds: ['p1', 'p2']}, note: '2枚の課題を1枚に'},
      {role: '解決', source: {kind: 'keep', pageId: 'p3'}, note: ''}
    ]), ctx)).toEqual([]);
  });
  it('reports unknown pages, missing notes, and a flow that drops every original page', () => {
    const problems = validateStoryline(storyline([
      {role: '導入です', source: {kind: 'keep', pageId: 'nope'}, note: ''},
      {role: '新しい', source: {kind: 'new'}, note: ' '}
    ]), ctx).join('\n');
    expect(problems).toContain('1枚目: 存在しない pageId');
    expect(problems).toContain('2枚目: 新しく作るページには note が必要');
    const allNew = validateStoryline(storyline([{role: 'aaaa', source: {kind: 'new'}, note: 'x'}, {role: 'bbbb', source: {kind: 'new'}, note: 'y'}]), ctx);
    expect(allNew.join()).toContain('1枚も使っていません');
  });
  it('schema rejects a merge of fewer than two pages', () => {
    expect(StorylineInputSchema.safeParse({requestId: 'r', aim: '狙いです', gaveUp: 'なし', slides: [
      {role: 'まとめ', source: {kind: 'merge', pageIds: ['p1']}, note: 'x'}, {role: 'つぎへ', source: {kind: 'keep', pageId: 'p2'}, note: ''}]}).success).toBe(false);
  });
});

describe('planStructure', () => {
  const idMap = mapByPosition({originalIds: ['p1', 'p2', 'p3'], copyIds: ['c1', 'c2', 'c3']});
  const s = storyline([
    {role: '結論を言い切る', source: {kind: 'new'}, note: '価値を一文で'},
    {role: '課題', source: {kind: 'merge', pageIds: ['p2', 'p1']}, note: '2枚を1枚に'},
    {role: '解決', source: {kind: 'keep', pageId: 'p3'}, note: ''},
    {role: 'もう一度課題', source: {kind: 'keep', pageId: 'p2'}, note: ''}
  ]);
  const plan = planStructure({storyline: s, idMap, layoutId: 'L_BLANK', idPrefix: 'x'});
  it('creates new pages, duplicates reused pages and deletes unused ones', () => {
    expect(plan.order).toEqual(['x_s0', 'c2', 'c3', 'x_d3']);
    expect(plan.requests).toContainEqual({createSlide: {objectId: 'x_s0', slideLayoutReference: {layoutId: 'L_BLANK'}}});
    expect(plan.requests).toContainEqual({duplicateObject: {objectId: 'c2', objectIds: {c2: 'x_d3'}}});
    expect(plan.requests).toContainEqual({deleteObject: {objectId: 'c1'}});
    expect(plan.requests.filter(r => 'deleteObject' in r)).toHaveLength(1);
  });
  it('moves every page into the storyline order, only touching the copy', () => {
    const moves = plan.requests.filter(r => 'updateSlidesPosition' in r) as Array<{updateSlidesPosition: {slideObjectIds: string[]; insertionIndex: number}}>;
    expect(moves.map(m => [m.updateSlidesPosition.slideObjectIds[0], m.updateSlidesPosition.insertionIndex])).toEqual([['x_s0', 0], ['c2', 1], ['c3', 2], ['x_d3', 3]]);
    expect(JSON.stringify(plan.requests)).not.toMatch(/"p[123]"/);
  });
  it('refuses a copy whose page count differs from the original', () => {
    expect(() => mapByPosition({originalIds: ['a', 'b'], copyIds: ['c']})).toThrow();
  });
  it('writes roles into speaker notes and labels new pages', () => {
    const notes = planNotes({storyline: s, order: plan.order, speakerNotesIds: new Map([['x_s0', 'n0'], ['c2', 'n1']]), idPrefix: 'x'});
    expect(notes).toContainEqual({insertText: {objectId: 'n0', text: '【Slipper 流れの案】1. 結論を言い切る\n見せること: 価値を一文で', insertionIndex: 0}});
    expect(JSON.stringify(notes)).toContain('元の 2 ページの内容をまとめる');
    expect(JSON.stringify(notes)).toContain(`"objectId":"${NOTE_PREFIX}_x_0"`);
  });
});

describe('pickLayout', () => {
  it('prefers the blank layout and falls back to a kept page layout', () => {
    expect(pickLayout([{objectId: 'a', name: 'TITLE'}, {objectId: 'b', name: 'BLANK'}], 'k')).toBe('b');
    expect(pickLayout([{objectId: 'a', name: 'TITLE'}], 'k')).toBe('k');
  });
});

import {contentKey, validateDeckReading} from '@shared/reading';

describe('validateDeckReading', () => {
  const ctx = {pageIds: ['p1', 'p2', 'p3', 'p4']};
  const reading = (sections: Array<{role: string; pageIds: string[]}>) => ({requestId: 'r', aim: '課題から順に説明する', gaveUp: '最初の驚き', relation: '社員向けの自分事は後半にある', sections});
  it('accepts sections that cover every page once, in deck order', () => {
    expect(validateDeckReading(reading([{role: '導入', pageIds: ['p1']}, {role: '課題', pageIds: ['p2', 'p3']}, {role: '解決', pageIds: ['p4']}]), ctx)).toEqual([]);
  });
  it('reports missing, duplicated, unknown and out-of-order pages', () => {
    const problems = validateDeckReading(reading([{role: '課題', pageIds: ['p3', 'p2']}, {role: 'まとめ', pageIds: ['p2', 'x']}]), ctx).join('\n');
    expect(problems).toContain('存在しない pageId です（x）');
    expect(problems).toContain('入っていないページがあります: p1, p4');
    expect(problems).toContain('複数のまとまり');
    expect(problems).toContain('順番どおり');
  });
  it('fingerprints page content', () => {
    expect(contentKey(['a'], ['i'])).not.toBe(contentKey(['a '], ['i']));
  });
});

describe('storyline steps', () => {
  it('requires every stage of the technique to be carried by a page', () => {
    const s = {requestId: 'r', aim: '冒頭に戻って結ぶ', gaveUp: '網羅', technique: 'callback', fromCurrent: '最後に冒頭へ戻る', slides: [
      {role: '冒頭の言葉', step: '冒頭の場面や言葉', source: {kind: 'keep' as const, pageId: 'p1'}, note: ''},
      {role: '課題と解決', step: '本論', source: {kind: 'keep' as const, pageId: 'p2'}, note: ''}
    ]};
    const steps = ['冒頭の場面や言葉', '本論', '冒頭への回帰'];
    expect(validateStoryline(s, {pageIds: ['p1', 'p2'], steps}).join()).toContain('手法の段を担うページがありません: 冒頭への回帰');
    const withReturn = {...s, slides: [...s.slides, {role: '冒頭の言葉に戻る', step: '冒頭への回帰', source: {kind: 'new' as const}, note: '冒頭の一文をもう一度'}]};
    expect(validateStoryline(withReturn, {pageIds: ['p1', 'p2'], steps})).toEqual([]);
    expect(validateStoryline({...withReturn, slides: [...withReturn.slides, {role: 'おまけ', step: '謎の段', source: {kind: 'new' as const}, note: 'x'}]}, {pageIds: ['p1', 'p2'], steps}).join()).toContain('謎の段');
  });
});
