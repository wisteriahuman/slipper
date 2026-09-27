import {createHash} from 'node:crypto';
import {nativeImage} from 'electron';
import type {PoolItem, PoolAsset} from '@shared/asset-pool';
import type {SlidesClient} from './google/slides-client';
import type {ApiPage, ApiPageElement} from './google/convert';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const poolId = (pageId: string, objectId?: string) => `pool_${digest(`${pageId}/${objectId ?? ''}`).slice(0,24)}`;
const nested = (items: ApiPageElement[]): ApiPageElement[] => items.flatMap(e => [e, ...nested(e.elementGroup?.children ?? [])]);
export function catalogItems(pages: ApiPage[]): PoolItem[] {
  return pages.flatMap((page, i) => {
    const elements = nested(page.pageElements ?? []);
    const context = elements.flatMap(e => (e.shape?.text?.textElements ?? []).map(t => t.textRun?.content ?? '')).join(' ').trim().slice(0,1600);
    const common = {pageId:page.objectId, pageNumber:i+1, context, selected:false};
    const whole:PoolItem = {...common,id:poolId(page.objectId),kind:'page',description:`${i+1}ページ全体${context ? `：${context.slice(0,60)}` : ''}`};
    return [whole,...elements.filter(e => e.image?.contentUrl || e.sheetsChart?.contentUrl).map((e):PoolItem => ({...common,id:poolId(page.objectId,e.objectId),objectId:e.objectId,kind:e.image ? 'image':'chart',description:e.title || e.description || (e.image ? '元画像':'グラフ'),previewUrl:e.image?.contentUrl ?? e.sheetsChart?.contentUrl}))];
  });
}

export async function resolvePoolAsset(slides: SlidesClient, presentationId: string, item: Pick<PoolItem,'id'|'pageId'|'objectId'|'kind'|'description'>): Promise<{asset:PoolAsset; imageUrl:string}> {
  const page = await slides.page(presentationId,item.pageId);
  const current = catalogItems([page]).find(x => x.id === item.id);
  if (!current) throw new Error(`素材元が見つかりません：${item.description}`);
  let imageUrl: string, dataUrl: string;
  if(item.kind === 'page') {
    const image = await slides.thumbnailImage(presentationId,item.pageId);
    imageUrl=image.contentUrl; dataUrl=image.dataUrl;
  } else {
    if (!current.previewUrl) throw new Error('素材画像を取得できません');
    imageUrl=current.previewUrl;
    const res=await fetch(imageUrl);
    if(!res.ok) throw new Error(`素材画像の取得に失敗しました (${res.status})`);
    const data=Buffer.from(await res.arrayBuffer());
    if(data.length > 20*1024*1024) throw new Error('素材画像は20MB以下にしてください');
    dataUrl=`data:${res.headers.get('content-type') ?? 'image/png'};base64,${data.toString('base64')}`;
  }
  const {width,height}=nativeImage.createFromDataURL(dataUrl).getSize();
  if(!width || !height) throw new Error('素材の画像を読み込めません');
  return {imageUrl,asset:{id:item.id,kind:item.kind,description:item.description,x:0,y:0,w:960,h:960*height/width,previewUrl:dataUrl,
    source:{pageId:item.pageId,objectId:item.objectId,kind:item.kind,fingerprint:digest(dataUrl),context:current.context}}};
}
