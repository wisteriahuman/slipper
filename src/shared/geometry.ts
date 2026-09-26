import {CANVAS} from './canvas';
import type {SlideElement} from './element';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// Applies an edit while keeping the element on the canvas. Locked elements are left untouched.
export function changeElement(elements: SlideElement[], id: string, patch: Partial<SlideElement>): SlideElement[] {
  return elements.map(e => {
    if (e.id !== id || e.locked) return e;
    const next = {...e, ...patch};
    next.w = clamp(next.w, 16, CANVAS.width);
    next.h = clamp(next.h, 16, CANVAS.height);
    next.x = clamp(next.x, 0, CANVAS.width - next.w);
    next.y = clamp(next.y, 0, CANVAS.height - next.h);
    return next;
  });
}

// Google Slides measures in EMU. The canvas maps onto the page's real width, keeping aspect ratio.
export type PageSize = {width: number; height: number};
export const EMU_PER_PT = 12700;
export const canvasScale = (page: PageSize) => page.width / CANVAS.width;
export const toEmu = (px: number, page: PageSize) => Math.round(px * canvasScale(page));
export const fromEmu = (emu: number, page: PageSize) => emu / canvasScale(page);
