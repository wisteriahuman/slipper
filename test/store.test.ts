import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {Store} from '../src/main/store';

describe('Store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slipper-store-'));
  const store = new Store(join(dir, 'test.db'));
  it('keeps the brief and color meanings per presentation', () => {
    store.saveBrief('deck1', 'Deck', {audience: '開発チーム', message: 'テストは道具'});
    store.setColorMeanings('deck1', [{ref: 'ACCENT1', meaning: 'いま空いている'}, {ref: 'ACCENT2', meaning: ' '}]);
    expect(store.getBrief('deck1')).toEqual({audience: '開発チーム', message: 'テストは道具'});
    store.saveBrief('deck1', 'Deck', {audience: '審査員', message: '使われる見込み', context: 'ハッカソン', subject: '大学生'});
    expect(store.getBrief('deck1')).toEqual({audience: '審査員', message: '使われる見込み', context: 'ハッカソン', subject: '大学生'});
    store.saveBrief('deck1', 'Deck', {audience: '開発チーム', message: 'テストは道具'});
    expect(store.getColorMeanings('deck1')).toEqual([{ref: 'ACCENT1', meaning: 'いま空いている'}]);
  });
  it('records requests, variants and adoptions, newest variant first', () => {
    const r1 = store.createRequest({presentationId: 'deck1', pageId: 'p1', source: 'button', approach: '場面', snapshot: {pageId: 'p1', texts: [], assets: []}});
    const r2 = store.createRequest({presentationId: 'deck1', pageId: 'p1', source: 'conversation', approach: '構造', snapshot: {pageId: 'p1', texts: [], assets: []}});
    const el = {id: 'a', type: 'text' as const, text: 'x', x: 0, y: 0, w: 10, h: 10, invented: false};
    const v1 = store.addVariant({requestId: r1, aim: '狙い1です', gaveUp: 'なし', technique: 'takahashi', supportingTechniques: ['negative-space'], frames: [{elements: [el]}]});
    const v2 = store.addVariant({requestId: r2, aim: '狙い2です', gaveUp: 'なし', technique: 'build-up', frames: [{elements: [el]}, {elements: [el, {...el, id: 'b'}]}]});
    store.finishRequest(r1, 'done');
    expect(store.listVariants('deck1', 'p1').map(v => v.id)).toEqual([v2.id, v1.id]);
    expect(store.listVariants('deck1', 'p1')[0]).toMatchObject({approach: '構造', technique: 'build-up', frames: [{elements: [el]}, {elements: [el, {...el, id: 'b'}]}]});
    expect(store.listVariants('deck1', 'p1')[1]!.supportingTechniques).toEqual(['negative-space']);
    expect(store.listVariants('deck1', 'p1')[1]!.frames).toEqual([{elements: [el]}]);
    expect(store.approachesUsed('deck1', 'p1').sort()).toEqual(['場面', '構造'].sort());
    const failed = store.createRequest({presentationId: 'deck1', pageId: 'p1', source: 'button', approach: '問い', snapshot: {pageId: 'p1', texts: [], assets: []}});
    store.finishRequest(failed, 'failed', 'timeout');
    expect(store.approachesUsed('deck1', 'p1')).not.toContain('問い');
    expect(store.addAdoption({variantId: v1.id, finalFrames: [[el]], aimFinal: '狙い1です', counts: {moved: 1, textChanged: 0, resized: 0}, insertedPageIds: ['np']})).toBeTruthy();
  });
  it('keeps storylines per deck and the flow role of each page in the built deck', () => {
    const r = store.createRequest({presentationId: 'deck1', pageId: '__deck__', source: 'button', approach: '結論から', snapshot: {pageIds: ['p1']}});
    const s = store.addStoryline({requestId: r, aim: '結論から話す', gaveUp: '背景', fromCurrent: '結論を冒頭へ', technique: 'scqa', slides: [{role: '結論です', source: {kind: 'new'}, note: '一文で'}, {role: '課題です', source: {kind: 'keep', pageId: 'p1'}, note: ''}]});
    expect(store.listStorylines('deck1').map(x => x.id)).toEqual([s.id]);
    expect(store.getStoryline(s.id)).toMatchObject({presentationId: 'deck1', approach: '結論から'});
    expect(store.listStorylines('deck1')[0]!.fromCurrent).toBe('結論を冒頭へ');
    store.addStorylineAdoption(s.id, 'deck2', [{pageId: 'n1', role: '結論です', note: '一文で'}, {pageId: 'c1', role: '課題です', note: ''}]);
    expect(store.flowRole('deck2', 'n1')).toEqual({role: '結論です', note: '一文で', position: 1, total: 2});
    expect(store.flowRole('deck1', 'n1')).toBeNull();
  });
  it('keeps the latest deck reading and page readings tied to the page content', () => {
    const r = store.createRequest({presentationId: 'deck1', pageId: '__deck__', source: 'button', approach: '今の流れの読み解き', snapshot: {pageIds: ['p1', 'p2']}});
    store.addDeckReading({requestId: r, aim: '課題から説明する', gaveUp: '冒頭の驚き', relation: '自分事は後半', sections: [{role: '課題', pageIds: ['p1', 'p2']}]}, ['p1', 'p2']);
    expect(store.latestDeckReading('deck1')).toMatchObject({aim: '課題から説明する', pageIds: ['p1', 'p2'], sections: [{role: '課題', pageIds: ['p1', 'p2']}]});
    store.savePageReading('deck1', 'p1', 'k1', {requestId: 'x', aim: '提案を一文で示す', gaveUp: '具体例'});
    expect(store.pageReading('deck1', 'p1', 'k1')).toMatchObject({aim: '提案を一文で示す'});
    expect(store.pageReading('deck1', 'p1', 'k2')).toBeNull();
  });
  it('cleans up', () => { store.close(); rmSync(dir, {recursive: true, force: true}); });
});
