import {BrowserWindow} from 'electron';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SlidePreview} from '../renderer/src/SlidePreview';
import type {VariantInput} from '@shared/element';
import type {Palette} from '@shared/palette';
import type {DecorationView, PageAssetView} from '@shared/ipc';
import {SLIDE_CSS} from '@shared/slide-style';

export type PreviewContext = {palette: Palette; assets: PageAssetView[]; decorations: DecorationView[]; pageImage: string | null; textBoxes: Array<{x: number; y: number; w: number; h: number}>};
export type PreviewResult = {images: Array<{label: string; base64: string; mimeType: string}>; problems: string[]};
export type RenderVariant = (variant: VariantInput, context: PreviewContext) => Promise<PreviewResult>;

// The exact React slide component and CSS used by the panel. No Google writes, preload, Node
// access or scripts from the model. A separate ephemeral session avoids sharing login cookies.
export const renderVariant: RenderVariant = async (variant, context) => {
  const win = new BrowserWindow({show: false, width: 960, height: 540, useContentSize: true,
    webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, partition: `preview-${crypto.randomUUID()}`}});
  win.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  const images: PreviewResult['images'] = [], problems: string[] = [];
  const timer = setTimeout(() => { if (!win.isDestroyed()) win.destroy(); }, 30_000);
  try {
    for (const [i, frame] of variant.frames.entries()) {
      const html = renderToStaticMarkup(createElement(SlidePreview, {...context, elements: frame.elements, width: 960}));
      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src 'unsafe-inline'"><style>html,body{margin:0;padding:0;width:960px;height:540px;overflow:hidden}*{box-sizing:border-box}${SLIDE_CSS}.slide-frame{border:0;border-radius:0}</style>${html}`));
      const overflow: string[] = await win.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        const urls = [...document.images].map(x => x.src);
        for (const e of document.querySelectorAll('.el-asset')) { const b = getComputedStyle(e).backgroundImage; if (b.startsWith('url(')) urls.push(b.slice(5, -2)); }
        const failed = [];
        await Promise.all([...new Set(urls)].map(url => new Promise(resolve => { const im = new Image(); im.onload = resolve; im.onerror = () => { failed.push('素材の画像を読み込めません'); resolve(); }; im.src = url; })));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return [...failed, ...[...document.querySelectorAll('.el-text')].filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map(e => e.dataset.elementId + ': 文字が枠からはみ出しています')];
      })()`);
      problems.push(...overflow.map(p => `${i + 1}枚目 ${p}`));
      const shot = await win.webContents.capturePage({x: 0, y: 0, width: 960, height: 540}, {stayHidden: true});
      images.push({label: `${i + 1}枚目。狙い: ${variant.aim}`, base64: shot.toPNG().toString('base64'), mimeType: 'image/png'});
    }
    return {images, problems};
  } finally { clearTimeout(timer); if (!win.isDestroyed()) win.destroy(); }
};
