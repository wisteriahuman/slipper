import {describe, expect, it} from 'vitest';
import {WRITING_GUIDE, briefBlock, buildDeckReadingPrompt, buildPageReadingPrompt, buildStorylinePrompt, buildVariantPrompt, colorGuide, techniqueBlock} from '../src/main/prompt';
import {AI_CHOICE} from '@shared/techniques';

const brief = {audience: '開発チーム', message: 'テストは道具'};
const page = {pageId: 'p', texts: [{id: 't', text: 'なぜテストを書くのか', x: 0, y: 0, w: 1, h: 1, size: null, bold: false}], assets: [{id: 'img', kind: 'image' as const, description: '写真', x: 0, y: 0, w: 200, h: 100}]};

describe('colorGuide', () => {
  it('forbids colored slots while no meaning is set', () => {
    const guide = colorGuide({hex: {}, meanings: []});
    expect(guide).toContain('色味のある色は使えない');
    expect(guide).not.toMatch(/使える色.*ACCENT/);
  });
  it('states what a colored slot means once it is set', () => {
    const guide = colorGuide({hex: {}, meanings: [{ref: 'ACCENT2', meaning: 'いま空いている'}]});
    expect(guide).toMatch(/使える色.*ACCENT2/);
    expect(guide).toContain('ACCENT2 は「いま空いている」だけを表す');
  });
  it('tells the AI the actual shade of each neutral color', () => {
    const guide = colorGuide({hex: {DARK1: '#1a9988', LIGHT1: '#ffffff', DARK2: '#1a1a1a', LIGHT2: '#e9edee', ACCENT1: '#595959'}, meanings: []});
    expect(guide).toContain('DARK2（#1a1a1a、暗い）');
    expect(guide).not.toMatch(/使える色.*DARK1/);
  });
});

describe('techniqueBlock', () => {
  it('describes an assigned technique and asks for its id', () => {
    const block = techniqueBlock('page', 'chiaroscuro', []);
    expect(block).toContain('暗くして一点を浮かべる');
    expect(block).toContain('technique に "chiaroscuro"');
    expect(block).toContain('連続したスライド（2〜3枚）');
  });
  it('gives the AI the catalog minus the assigned ones, steering away from the obvious', () => {
    const block = techniqueBlock('page', AI_CHOICE, ['takahashi', 'build-up']);
    expect(block).toContain('内容と聞き手に合うことを優先');
    expect(block).toContain('"id":"isotype"');
    expect(block).not.toContain('"id":"takahashi"');
    expect(block).not.toContain('"id":"scqa"');
    expect(techniqueBlock('flow', AI_CHOICE, [])).toContain('"id":"in-medias-res"');
  });
  it('rejects an unknown technique', () => {
    expect(() => techniqueBlock('page', 'nope', [])).toThrow();
  });
});

describe('buildVariantPrompt', () => {
  it('includes the brief, the page with asset positions, the technique and the request id', () => {
    const prompt = buildVariantPrompt({requestId: 'req-1', brief, palette: {hex: {}, meanings: []}, page, technique: 'isotype', direction: 'もっと短く'});
    for (const part of ['req-1', '開発チーム', 'テストは道具', 'なぜテストを書くのか', '"assetId":"img"', '"w":200,"h":100', '単位グラフ', 'もっと短く', '描き直さずに素材として再利用', '同じ id・同じ位置・同じ大きさで残し', 'opacity']) expect(prompt).toContain(part);
  });
  it('tells the page-level request where the page sits in the flow', () => {
    const prompt = buildVariantPrompt({requestId: 'r', brief, palette: {hex: {}, meanings: []}, page: {pageId: 'p', texts: [], assets: []},
      flowRole: {role: '結論を言い切る', note: '価値を一文で', position: 1, total: 8}, technique: 'takahashi'});
    expect(prompt).toContain('8枚中1枚目');
    expect(prompt).toContain('役割: 結論を言い切る');
  });
});

describe('flow prompts', () => {
  it('lists every page, marks deliberate sequences, and asks for a rebuilt order', () => {
    const prompt = buildStorylinePrompt({requestId: 'req-9', brief, technique: 'monroe',
      pages: [{pageId: 'p6', texts: ['着目'], assets: []}, {pageId: 'p7', texts: ['着目', '着目ポイント'], assets: [], continuesPrevious: true}]});
    for (const part of ['req-9', 'submit_storyline', 'モンローの動機づけの順序', '"pageId":"p7","texts":["着目","着目ポイント"],"assets":[],"continuesPrevious":true',
      '重複ではないので、まとめたり削ったりしない', '並べ替えだけで狙いを実現できる場合', '今の資料になければ、new で作る']) expect(prompt).toContain(part);
  });
  it('gives storyline requests the reading and asks what changes from it', () => {
    const prompt = buildStorylinePrompt({requestId: 's', brief, technique: 'scqa', pages: [{pageId: 'p1', texts: [], assets: []}, {pageId: 'p2', texts: [], assets: []}],
      reading: {id: 'x', requestId: 'r', aim: '課題から順に説明する', gaveUp: '冒頭の驚き', relation: '自分事は後半', sections: [{role: '課題', pageIds: ['p2']}], pageIds: ['p1', 'p2'], receivedAt: 0}});
    expect(prompt).toContain('狙い: 課題から順に説明する');
    expect(prompt).toContain('"pages":[2]');
    expect(prompt).toContain('fromCurrent');
  });
});

describe('reading prompts', () => {
  it('asks for a deck reading that describes choices without scoring', () => {
    const prompt = buildDeckReadingPrompt({requestId: 'rd', brief, pages: [{pageId: 'p1', texts: ['提案'], assets: []}]});
    for (const part of ['submit_deck_reading', '"rd"', '良し悪しや点数は書かない', 'ちょうど1つのまとまり']) expect(prompt).toContain(part);
  });
  it('asks for a page reading', () => {
    const prompt = buildPageReadingPrompt({requestId: 'rp', brief, page});
    expect(prompt).toContain('submit_page_reading');
    expect(prompt).toContain('なぜテストを書くのか');
  });
});

describe('briefBlock and shared guidance', () => {
  it('separates the presentation audience from the subject of the content', () => {
    const block = briefBlock({context: 'ハッカソンの最終発表', audience: '審査員', message: '使われる見込みがある', subject: '大学生'});
    expect(block).toContain('誰に（プレゼンの聞き手）: 審査員');
    expect(block).toContain('題材の対象（プロダクトのユーザーなど）: 大学生');
    expect(block).toContain('場面の知識: ハッカソン');
    expect(briefBlock({audience: 'a', message: 'b'})).not.toContain('場面');
  });
  it('gives every prompt the wording guide and the page images tool', () => {
    for (const prompt of [
      buildVariantPrompt({requestId: 'r', brief, palette: {hex: {}, meanings: []}, page, technique: 'takahashi'}),
      buildStorylinePrompt({requestId: 'r', brief, pages: [], technique: 'abt'}),
      buildDeckReadingPrompt({requestId: 'r', brief, pages: []}),
      buildPageReadingPrompt({requestId: 'r', brief, page})
    ]) { expect(prompt).toContain(WRITING_GUIDE); expect(prompt).toContain('get_page_images'); }
  });
});
