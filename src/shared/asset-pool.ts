// A selected source is frozen with a variant. URLs used for Google insertion are refreshed later.
// Library assets are not in the deck: pageId is empty and library carries the terms of use.
export type AssetSource = {
  pageId: string; objectId?: string; kind: 'page' | 'image' | 'chart' | 'library'; fingerprint: string; context: string;
  library?: {key: string; title: string; credit?: string; nearUse?: boolean; limitNote?: string};
};
export type PoolItem = {
  id: string; pageId: string; objectId?: string; kind: 'page' | 'image' | 'chart'; pageNumber: number;
  description: string; context: string; previewUrl?: string; selected: boolean;
};
export type PoolAsset = {
  id: string; kind: 'page' | 'image' | 'chart' | 'icon' | 'illustration' | 'photo'; description: string;
  x: number; y: number; w: number; h: number; previewUrl: string; source: AssetSource;
  // Icons only: the SVG drawn with currentColor, so an element's color can recolor it.
  svg?: string;
};
export type AssetPoolState = {items: PoolItem[]; assets: PoolAsset[]; loading: boolean; error: string | null};
export const MAX_POOL_SELECTION = 6;
