// SVG → PNG in a hidden, sandboxed window, keeping transparency. Google Slides and the AI take raster images only.
import {BrowserWindow, nativeImage} from 'electron';
import type {Rasterize, Shrink} from './library';

export const rasterize: Rasterize = async (svg, width) => {
  const win = new BrowserWindow({show: false, width: 200, height: 200, webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, partition: `raster-${crypto.randomUUID()}`}});
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'">`));
    const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    return await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = ${Math.round(width)}, h = Math.max(1, Math.round(w * (img.naturalHeight || 1) / (img.naturalWidth || 1)));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('SVG を画像にできません'));
      img.src = ${JSON.stringify(src)};
    })`) as string;
  } finally { if (!win.isDestroyed()) win.destroy(); }
};

export const shrink: Shrink = (dataUrl, width) => {
  const image = nativeImage.createFromDataURL(dataUrl);
  const size = image.getSize();
  return size.width > width ? image.resize({width}).toDataURL() : dataUrl;
};
