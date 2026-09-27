import {describe, expect, it, vi} from 'vitest';
vi.mock('electron', () => ({nativeImage: {}}));
import {catalogItems, poolId} from '../src/main/asset-pool';
import type {ApiPage} from '../src/main/google/convert';

const box = {size: {width: {magnitude: 100, unit: 'EMU' as const}, height: {magnitude: 50, unit: 'EMU' as const}}, transform: {scaleX: 1, scaleY: 1}};
const pages: ApiPage[] = [
  {objectId: 'p1', pageElements: [{objectId: 'h', ...box, shape: {shapeType: 'TEXT_BOX', text: {textElements: [{textRun: {content: '予約画面の変更'}}]}}}]},
  {objectId: 'p2', pageElements: [
    {objectId: 'g', ...box, elementGroup: {children: [{objectId: 'shot', ...box, title: '確定ボタン', image: {contentUrl: 'https://example.com/shot'}}]}},
    {objectId: 'c', ...box, sheetsChart: {contentUrl: 'https://example.com/chart'}},
    {objectId: 'broken', ...box, image: {}}
  ]}
];

describe('catalogItems', () => {
  const items = catalogItems(pages);
  it('lists every page as a whole, plus images (also inside groups) and charts that have content', () => {
    expect(items.map(i => [i.pageNumber, i.kind, i.objectId])).toEqual([[1, 'page', undefined], [2, 'page', undefined], [2, 'image', 'shot'], [2, 'chart', 'c']]);
  });
  it('keeps the page text as context and ids stable across scans', () => {
    expect(items[0]!.context).toBe('予約画面の変更');
    expect(items[0]!.description).toContain('予約画面の変更');
    expect(items[2]!.description).toBe('確定ボタン');
    expect(items[2]!.id).toBe(poolId('p2', 'shot'));
    expect(catalogItems(pages).map(i => i.id)).toEqual(items.map(i => i.id));
    expect(items.every(i => !i.selected)).toBe(true);
  });
});
