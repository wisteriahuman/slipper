import {describe, expect, it} from 'vitest';
import {continuesPrevious, planSequence, planWriteBack, toDecorations, toPageContent, toPalette, type ApiPage} from '../src/main/google/convert';
import type {SlideElement} from '@shared/element';

// Default Google Slides page: 10in × 5.625in.
const size = {width: 9144000, height: 5143500};
const scale = size.width / 960;
const page: ApiPage = {objectId: 'p1', pageElements: [
  {objectId: 'title', size: {width: {magnitude: 480 * scale, unit: 'EMU'}, height: {magnitude: 60 * scale, unit: 'EMU'}},
    transform: {scaleX: 1, scaleY: 1, translateX: 64 * scale, translateY: 32 * scale, unit: 'EMU'},
    shape: {shapeType: 'TEXT_BOX', text: {textElements: [{textRun: {content: 'なぜテストを書くのか\n', style: {fontSize: {magnitude: 24, unit: 'PT'}, bold: true}}}]}}},
  {objectId: 'deco', shape: {shapeType: 'RECTANGLE'}, size: {width: {magnitude: 100, unit: 'EMU'}, height: {magnitude: 100, unit: 'EMU'}}},
  {objectId: 'photo', description: 'チームの写真', image: {contentUrl: 'https://example/img'}, size: {width: {magnitude: 100 * scale, unit: 'EMU'}, height: {magnitude: 50 * scale, unit: 'EMU'}},
    transform: {scaleX: 2, scaleY: 2, translateX: 600 * scale, translateY: 200 * scale, unit: 'EMU'}},
  {objectId: 'tbl', table: {tableRows: [{tableCells: [{text: {textElements: [{textRun: {content: '項目\n'}}]}}, {text: {textElements: [{textRun: {content: '値\n'}}]}}]}]}}
]};

describe('toPageContent', () => {
  const content = toPageContent(page, size);
  it('reads text boxes with position and size on the canvas', () => {
    expect(content.texts).toHaveLength(1);
    expect(content.texts[0]).toMatchObject({id: 'title', text: 'なぜテストを書くのか', bold: true});
    expect(content.texts[0]!.x).toBeCloseTo(64);
    expect(content.texts[0]!.w).toBeCloseTo(480);
    expect(content.texts[0]!.size).toBeCloseTo(24 * 12700 / scale); // 24pt on a 720pt-wide page = 32px
  });
  it('treats images, tables and shapes without text as reusable assets', () => {
    expect(content.assets.map(a => [a.id, a.kind])).toEqual([['deco', 'shape'], ['photo', 'image'], ['tbl', 'table']]);
    expect(content.assets[1]).toMatchObject({description: 'チームの写真'});
    expect(content.assets[1]!.w).toBeCloseTo(200); // scaleX 2 applied
    expect(content.assets[2]!.description).toContain('項目 / 値');
  });
});

describe('toDecorations', () => {
  const layout: ApiPage = {objectId: 'layout', pageElements: [
    {objectId: 'band', shape: {shapeType: 'RECTANGLE', shapeProperties: {shapeBackgroundFill: {solidFill: {color: {rgbColor: {red: 0.9, green: 0.92, blue: 0.93}}}}}},
      size: {width: {magnitude: 960 * scale, unit: 'EMU'}, height: {magnitude: 40 * scale, unit: 'EMU'}}, transform: {scaleX: 1, scaleY: 1, translateX: 0, translateY: 0, unit: 'EMU'}},
    {objectId: 'title-ph', shape: {shapeType: 'TEXT_BOX', placeholder: {type: 'TITLE'}}, size: {width: {magnitude: 100, unit: 'EMU'}, height: {magnitude: 100, unit: 'EMU'}}},
    // Real-world shape: the title rule is two rotated rectangles in a group. Rotation comes back as
    // shear with scaleX/scaleY omitted (= 0).
    {objectId: 'rule', transform: {scaleX: 0.7006, scaleY: 1.8185, translateX: -2378749.2175, translateY: -3516848.0475, unit: 'EMU'}, elementGroup: {children: [
      {objectId: 'r1', shape: {shapeType: 'RECTANGLE', shapeProperties: {shapeBackgroundFill: {solidFill: {color: {themeColor: 'ACCENT1'}}}}},
        size: {width: {magnitude: 3000000, unit: 'EMU'}, height: {magnitude: 3000000, unit: 'EMU'}},
        transform: {shearX: 0.1774, shearY: -0.0084, translateX: 5112824.61, translateY: 2614203.9075, unit: 'EMU'}}
    ]}}
  ]};
  const decor = toDecorations([layout], size, {ACCENT1: '#1a9988'});
  it('keeps bands and rules but not placeholders', () => {
    expect(decor.map(d => [d.kind, d.color])).toEqual([['rect', '#e6ebed'], ['rect', '#1a9988']]);
  });
  it('turns a rotated shape inside a group into the thin bar it really is', () => {
    const rule = decor[1]!;
    expect(rule.x).toBeCloseTo(126, 0);
    expect(rule.y).toBeCloseTo(125, 0);
    expect(rule.w).toBeCloseTo(39, 0);
    expect(rule.h).toBeLessThan(6);
  });
});

describe('toPalette', () => {
  it('converts the theme colors to hex', () => {
    expect(toPalette({colors: [{type: 'ACCENT1', color: {red: 1, green: 0.5, blue: 0}}]}, []).hex).toEqual({ACCENT1: '#ff8000'});
  });
});

describe('planWriteBack', () => {
  const elements: SlideElement[] = [
    {id: 'h', type: 'text', text: '金曜17時', x: 64, y: 64, w: 400, h: 50, size: 32, bold: true, color: 'ACCENT1', invented: true},
    {id: 'img', type: 'asset', assetId: 'photo', x: 500, y: 100, w: 300, h: 150, invented: false},
    {id: 'bar', type: 'shape', shape: 'rect', fill: 'DARK2', x: 64, y: 130, w: 200, h: 4, invented: false}
  ];
  const {newPageId, requests} = planWriteBack({page, size, elements, idPrefix: 'slp_x'});
  it('duplicates the page first and never touches the original objects', () => {
    expect(requests[0]).toEqual({duplicateObject: {objectId: 'p1', objectIds: {p1: newPageId, title: 'slp_x_c0', deco: 'slp_x_c1', photo: 'slp_x_c2', tbl: 'slp_x_c3'}}});
    const touched = JSON.stringify(requests.slice(1));
    for (const original of ['"title"', '"deco"', '"photo"', '"tbl"', '"p1"']) expect(touched).not.toContain(original);
  });
  it('keeps used assets (moved and resized) and deletes the rest from the copy', () => {
    expect(requests).toContainEqual({deleteObject: {objectId: 'slp_x_c0'}});
    expect(requests).toContainEqual({deleteObject: {objectId: 'slp_x_c3'}});
    const move = requests.find(r => 'updatePageElementTransform' in r) as {updatePageElementTransform: {objectId: string; transform: {scaleX: number; translateX: number}}};
    expect(move.updatePageElementTransform.objectId).toBe('slp_x_c2');
    expect(move.updatePageElementTransform.transform.scaleX).toBeCloseTo(3); // 300px from a 100px base
    expect(move.updatePageElementTransform.transform.translateX).toBe(Math.round(500 * scale));
  });
  it('draws new text and shapes on the new page with theme colors', () => {
    const style = requests.find(r => 'updateTextStyle' in r) as {updateTextStyle: {style: {foregroundColor: unknown; fontSize: {magnitude: number}}}};
    expect(style.updateTextStyle.style.foregroundColor).toEqual({opaqueColor: {themeColor: 'ACCENT1'}});
    expect(style.updateTextStyle.style.fontSize.magnitude).toBe(24);
    expect(JSON.stringify(requests)).toContain('"themeColor":"DARK2"');
    expect(requests.filter(r => 'createShape' in r)).toHaveLength(2);
  });
  it('restacks elements in the variant order so kept images are not hidden behind new shapes', () => {
    const order = requests.filter(r => 'updatePageElementsZOrder' in r).map(r => (r as {updatePageElementsZOrder: {pageElementObjectIds: string[]}}).updatePageElementsZOrder.pageElementObjectIds[0]);
    expect(order).toEqual(['slp_x_n0', 'slp_x_c2', 'slp_x_n2']);
    const lastCreate = requests.map(r => Object.keys(r)[0]).lastIndexOf('updateTextStyle');
    expect(requests.findIndex(r => 'updatePageElementsZOrder' in r)).toBeGreaterThan(lastCreate);
  });
});

describe('planSequence', () => {
  const frame1: SlideElement[] = [{id: 't', type: 'text', text: '課題', x: 64, y: 64, w: 400, h: 50, size: 32, invented: false}];
  const frame2: SlideElement[] = [...frame1, {id: 'cover', type: 'shape', shape: 'rect', fill: 'DARK1', opacity: 0.6, x: 0, y: 0, w: 960, h: 540, invented: true}];
  const {newPageIds, requests} = planSequence({page, size, frames: [frame1, frame2], idPrefix: 'slp_s'});
  it('returns the new pages in slide order and builds the last one first', () => {
    expect(newPageIds).toEqual(['slp_sf0_page', 'slp_sf1_page']);
    const duplicates = requests.filter(r => 'duplicateObject' in r).map(r => Object.values((r as {duplicateObject: {objectIds: Record<string, string>}}).duplicateObject.objectIds)[0]);
    expect(duplicates).toEqual(['slp_sf1_page', 'slp_sf0_page']);
  });
  it('keeps the transparency of a covering shape', () => {
    expect(JSON.stringify(requests)).toContain('"alpha":0.6');
  });
});

describe('continuesPrevious', () => {
  const t = (id: string, text: string, x = 64, y = 64) => ({id, text, x, y, w: 400, h: 40, size: 24, bold: false});
  const chart = {id: 'c', kind: 'group' as const, description: 'グラフ', x: 64, y: 150, w: 800, h: 300};
  const graph = {pageId: 'p6', texts: [t('a', '大学生活を始めたばかりの学生に着目'), t('b', '4月', 300, 480)], assets: [chart]};
  it('recognizes a build that keeps the page and adds a highlight', () => {
    const highlighted = {pageId: 'p7', texts: [t('a2', '大学生活を始めたばかりの学生に着目'), t('b2', '4月', 300, 480), t('n', '着目ポイント', 600, 120)], assets: [{...chart, id: 'c2'}]};
    expect(continuesPrevious(graph, highlighted)).toBe(true);
  });
  it('does not treat a different page as a continuation', () => {
    expect(continuesPrevious(graph, {pageId: 'p8', texts: [t('x', 'どんな場面でさみしさを感じるのか')], assets: []})).toBe(false);
    expect(continuesPrevious({pageId: 'e', texts: [], assets: []}, graph)).toBe(false);
  });
});

describe('lines as assets', () => {
  it('tells curves apart from straight lines', () => {
    const p: ApiPage = {objectId: 'p', pageElements: [
      {objectId: 'curve', line: {lineType: 'CURVED_CONNECTOR_3'}, size: {width: {magnitude: 1000, unit: 'EMU'}, height: {magnitude: 500, unit: 'EMU'}}, transform: {scaleX: 1, scaleY: 1}},
      {objectId: 'axis', line: {lineCategory: 'STRAIGHT', lineType: 'STRAIGHT_LINE'}, size: {width: {magnitude: 1000, unit: 'EMU'}, height: {magnitude: 0, unit: 'EMU'}}, transform: {scaleX: 1, scaleY: 1}},
      // A hand-drawn curve, as the API returns it in the field test: no type at all.
      {objectId: 'free', line: {}, size: {width: {magnitude: 1000, unit: 'EMU'}, height: {magnitude: 500, unit: 'EMU'}}, transform: {scaleX: 1, scaleY: 1}}
    ]};
    expect(toPageContent(p, size).assets.map(a => a.description)).toEqual(['曲線', '直線', '自由な線（曲線など。形は画像で確かめる）']);
  });
});

describe('asset transforms during zoom', () => {
  it('keeps the orientation of a rotated asset while scaling and translating its bounds', () => {
    const page: ApiPage = {objectId:'p',pageElements:[{objectId:'rotated',image:{contentUrl:'https://example.com/i'},size:{width:{magnitude:100,unit:'EMU'},height:{magnitude:50,unit:'EMU'}},transform:{scaleX:0,scaleY:0,shearX:-1,shearY:1,translateX:200,translateY:100,unit:'EMU'}}]};
    const plan = planWriteBack({page,size:{width:960,height:540},idPrefix:'x',elements:[{id:'a',type:'asset',assetId:'rotated',x:300,y:200,w:100,h:200,invented:false}]});
    expect(plan.requests).toContainEqual({updatePageElementTransform:{objectId:'x_c0',applyMode:'ABSOLUTE',transform:{scaleX:0,scaleY:0,shearX:-2,shearY:2,translateX:400,translateY:200,unit:'EMU'}}});
  });
});
