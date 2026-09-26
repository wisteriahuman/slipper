import {SLIDE_CSS} from '@shared/slide-style';
import type {PointerEvent as ReactPointerEvent} from 'react';
import {CANVAS} from '@shared/canvas';
import type {SlideElement} from '@shared/element';
import {colorHex, type Palette} from '@shared/palette';
import type {DecorationView, PageAssetView} from '@shared/ipc';

// Neutral fallbacks for decks whose theme colors could not be read.
const FALLBACK: Record<string, string> = {DARK1: '#1f1f1f', LIGHT1: '#ffffff', DARK2: '#5f6368', LIGHT2: '#eeeeee'};
export const hexOf = (palette: Palette, ref: string | undefined, fallback: string) => colorHex(palette, ref, FALLBACK[ref ?? ''] ?? fallback);

type Props = {
  elements: SlideElement[]; palette: Palette; assets: PageAssetView[]; decorations: DecorationView[]; width: number;
  // The original page as Google renders it; assets are cut out of it so they look as they really do.
  pageImage?: string | null;
  // Original text positions: a crop of the page image would otherwise show the old labels too.
  textBoxes?: Array<{x: number; y: number; w: number; h: number}>;
  showInvented?: boolean; selectedId?: string | null;
  onPointerDown?: (e: ReactPointerEvent, element: SlideElement) => void;
};

export function SlidePreview({elements, palette, assets, decorations, width, pageImage, textBoxes = [], showInvented, selectedId, onPointerDown}: Props) {
  const scale = width / CANVAS.width;
  return (
    <div className="slide-frame" style={{width, height: CANVAS.height * scale}}>
      <style>{SLIDE_CSS}</style>
      <div className="slide-stage" style={{width: CANVAS.width, height: CANVAS.height, transform: `scale(${scale})`, background: hexOf(palette, 'LIGHT1', '#fff')}}>
        {/* Layout decorations stay on the added page, so they are drawn underneath the variant. */}
        {decorations.map((d, i) => <div key={`decor-${i}`} className="decor" style={{left: d.x, top: d.y, width: d.w, height: d.h, background: d.color}} />)}
        {elements.map(e => {
          const cls = ['el', `el-${e.type}`, showInvented && e.invented ? 'invented' : '', selectedId === e.id ? 'selected' : '', e.locked ? 'locked' : '', onPointerDown ? 'editable' : ''].join(' ');
          const box = {left: e.x, top: e.y, width: e.w, height: e.h};
          const handlers = onPointerDown ? {onPointerDown: (ev: ReactPointerEvent) => onPointerDown(ev, e)} : {};
          if (e.type === 'text') return (
            <div key={e.id} data-element-id={e.id} className={cls} {...handlers} style={{...box, fontSize: e.size ?? 18, fontWeight: e.bold ? 700 : 400, color: hexOf(palette, e.color, '#1f1f1f')}}>{e.text}</div>
          );
          if (e.type === 'asset') {
            const asset = assets.find(a => a.id === e.assetId);
            // Scale the page image so the asset's original box fills the element's box.
            const crop = asset && pageImage && asset.w > 0 && asset.h > 0 ? {
              backgroundImage: `url(${pageImage})`, backgroundRepeat: 'no-repeat',
              backgroundSize: `${CANVAS.width * e.w / asset.w}px ${CANVAS.height * e.h / asset.h}px`,
              backgroundPosition: `${-asset.x * e.w / asset.w}px ${-asset.y * e.h / asset.h}px`
            } : null;
            // Text that overlaps the asset on the original page, mapped into the element's box and painted over.
            const masks = crop && asset ? textBoxes.filter(t => t.x < asset.x + asset.w && t.x + t.w > asset.x && t.y < asset.y + asset.h && t.y + t.h > asset.y) : [];
            const sx = asset ? e.w / (asset.w || 1) : 1, sy = asset ? e.h / (asset.h || 1) : 1;
            return (
              <div key={e.id} className={`${cls} ${crop ? 'cropped' : ''}`} {...handlers} style={{...box, ...(crop ?? {})}}>
                {!crop && (asset?.contentUrl ? <img src={asset.contentUrl} alt={asset.description} draggable={false} /> : <span>{asset?.description ?? '素材'}</span>)}
                {asset && masks.map((t, i) => <i key={i} className="crop-mask" style={{left: (t.x - asset.x) * sx, top: (t.y - asset.y) * sy, width: t.w * sx, height: t.h * sy, background: hexOf(palette, 'LIGHT1', '#fff')}} />)}
              </div>
            );
          }
          if (e.shape === 'line') return (
            <svg key={e.id} data-element-id={e.id} className={cls} {...handlers} style={{...box, overflow: 'visible'}} viewBox={`0 0 ${e.w} ${e.h}`} preserveAspectRatio="none">
              <line x1="0" y1="0" x2={e.w} y2={e.h} stroke={hexOf(palette, e.fill, '#5f6368')} strokeWidth="3" vectorEffect="non-scaling-stroke" />
            </svg>
          );
          return <div key={e.id} data-element-id={e.id} className={cls} {...handlers} style={{...box, background: e.fill ? hexOf(palette, e.fill, '#ddd') : 'transparent', opacity: e.opacity ?? 1, borderRadius: e.shape === 'ellipse' ? '50%' : e.shape === 'roundRect' ? 16 : 0}} />;
        })}
      </div>
    </div>
  );
}
