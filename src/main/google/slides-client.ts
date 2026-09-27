// Thin Google Slides API client. Reads pages and applies the write-back plan.
import type {PageSize} from '@shared/geometry';
import type {ApiColorScheme, ApiPage} from './convert';
import type {GoogleAuth} from './oauth';

type Presentation = {title?: string; pageSize?: {width?: {magnitude?: number}; height?: {magnitude?: number}}; slides?: Array<{objectId: string; slideProperties?: {layoutObjectId?: string; masterObjectId?: string}}>; masters?: Array<{pageProperties?: {colorScheme?: ApiColorScheme}}>};

export class SlidesClient {
  constructor(private auth: GoogleAuth) {}

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`https://slides.googleapis.com/v1/presentations/${path}`, {...init, headers: {Authorization: `Bearer ${await this.auth.accessToken()}`, 'Content-Type': 'application/json', ...init.headers}});
    const data = await res.json() as T & {error?: {message?: string; status?: string}};
    if (!res.ok) throw new Error(res.status === 403 || res.status === 404 ? 'この資料を読む権限がありません（Google の接続を確認してください）' : `Google Slides API: ${data.error?.message ?? res.status}`);
    return data;
  }

  async presentation(id: string) {
    const p = await this.call<Presentation>(`${encodeURIComponent(id)}?fields=${encodeURIComponent('title,pageSize,slides(objectId,slideProperties(layoutObjectId,masterObjectId)),masters(pageProperties(colorScheme))')}`);
    const size: PageSize = {width: p.pageSize?.width?.magnitude ?? 9144000, height: p.pageSize?.height?.magnitude ?? 5143500};
    const parents = Object.fromEntries((p.slides ?? []).map(s => [s.objectId, {layoutId: s.slideProperties?.layoutObjectId, masterId: s.slideProperties?.masterObjectId}]));
    return {title: p.title ?? '', size, parents, colorScheme: p.masters?.[0]?.pageProperties?.colorScheme};
  }

  // Every slide with its elements, for proposing a new flow for the whole deck.
  async allSlides(presentationId: string) {
    const p = await this.call<{slides?: ApiPage[]}>(`${encodeURIComponent(presentationId)}?fields=${encodeURIComponent('slides(objectId,pageElements)')}`);
    return p.slides ?? [];
  }

  // Slide order, layouts and speaker-notes shapes, for building a storyline in a copy.
  async structure(presentationId: string) {
    type S = {slides?: Array<{objectId: string; slideProperties?: {layoutObjectId?: string; notesPage?: {notesProperties?: {speakerNotesObjectId?: string}}}}>; layouts?: Array<{objectId: string; layoutProperties?: {name?: string}}>};
    const p = await this.call<S>(`${encodeURIComponent(presentationId)}?fields=${encodeURIComponent('slides(objectId,slideProperties(layoutObjectId,notesPage(notesProperties(speakerNotesObjectId)))),layouts(objectId,layoutProperties(name))')}`);
    return {
      slides: (p.slides ?? []).map(s => ({id: s.objectId, layoutId: s.slideProperties?.layoutObjectId, notesId: s.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId})),
      layouts: (p.layouts ?? []).map(l => ({objectId: l.objectId, name: l.layoutProperties?.name}))
    };
  }

  page = (presentationId: string, pageId: string) =>
    this.call<ApiPage>(`${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}`);

  // The revision and elements must come from the same response for conditional writes.
  async editingPage(presentationId: string, pageId: string) {
    const p = await this.call<{revisionId?: string; pageSize?: {width?: {magnitude?: number; unit?: string}; height?: {magnitude?: number; unit?: string}}; slides?: ApiPage[]}>(`${encodeURIComponent(presentationId)}?fields=${encodeURIComponent('revisionId,pageSize,slides')}`);
    const page = p.slides?.find(s => s.objectId === pageId);
    if (!page) throw new Error('このページは削除されたか、移動しています。Google Slides でページを選び直してください');
    if (!p.revisionId) throw new Error('編集用の版を取得できません。この資料の編集権限を確認してください');
    const emu = (d: {magnitude?: number; unit?: string} | undefined, fallback: number) => d?.magnitude === undefined ? fallback : d.magnitude * (d.unit === 'PT' ? 12700 : 1);
    return {page, size: {width: emu(p.pageSize?.width, 9144000), height: emu(p.pageSize?.height, 5143500)}, revisionId: p.revisionId};
  }

  // A rendered image of the page as Google draws it, returned as a data URL. Google's image URLs
  // expire after about 30 minutes and fail when many are loaded at once from the panel, so the
  // bytes are fetched here, one request at a time per caller.
  async thumbnail(presentationId: string, pageId: string, size: 'SMALL' | 'MEDIUM' | 'LARGE' = 'LARGE'): Promise<string> {
    return (await this.thumbnailImage(presentationId,pageId,size)).dataUrl;
  }

  async thumbnailImage(presentationId: string, pageId: string, size: 'SMALL' | 'MEDIUM' | 'LARGE' = 'LARGE') {
    const {contentUrl} = await this.call<{contentUrl: string}>(`${encodeURIComponent(presentationId)}/pages/${encodeURIComponent(pageId)}/thumbnail?thumbnailProperties.thumbnailSize=${size}`);
    const res = await fetch(contentUrl);
    if (!res.ok) throw new Error(`ページ画像を取得できませんでした: ${res.status}`);
    return {contentUrl,dataUrl:`data:${res.headers.get('content-type') ?? 'image/png'};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`};
  }

  batchUpdate = (presentationId: string, requests: object[], requiredRevisionId?: string) =>
    this.call(`${encodeURIComponent(presentationId)}:batchUpdate`, {method: 'POST', body: JSON.stringify({requests, ...(requiredRevisionId ? {writeControl: {requiredRevisionId}} : {})})});
}
