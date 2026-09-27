import {describe, expect, it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlidePreview} from '../src/renderer/src/SlidePreview';

const palette = {hex: {DARK1: '#111111', LIGHT1: '#fafafa'}, meanings: []};
const asset = {id: 'lib_x', kind: 'icon', description: 'check', x: 0, y: 0, w: 96, h: 96, previewUrl: 'data:image/png;base64,AA==', svg: '<svg stroke="currentColor"></svg>'};
const html = (color?: string) => renderToStaticMarkup(createElement(SlidePreview, {palette, assets: [asset], decorations: [], width: 960,
  elements: [{id: 'i', type: 'asset', assetId: 'lib_x', x: 0, y: 0, w: 96, h: 96, invented: false, ...(color ? {color} : {})}]}));

describe('SlidePreview with library images', () => {
  it('draws an icon in the element color from its SVG, on a transparent box', () => {
    const src = /src="data:image\/svg\+xml;base64,([^"]+)"/.exec(html('LIGHT1'))![1]!;
    expect(Buffer.from(src, 'base64').toString()).toContain('stroke="#fafafa"');
    expect(html('LIGHT1')).toContain('cropped');
  });
  it('uses the default image when no color is given', () => {
    expect(html()).toContain('src="data:image/png;base64,AA=="');
  });
});
