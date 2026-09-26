import {afterEach, describe, expect, it} from 'vitest';
import {Controller} from '../src/main/controller';
import {Store} from '../src/main/store';
import type {GoogleAuth} from '../src/main/google/oauth';
import type {SlidesClient} from '../src/main/google/slides-client';
import type {DriveClient} from '../src/main/google/drive-client';
import type {VariantInput} from '../src/shared/element';

const stores:Store[]=[];
afterEach(()=>{for(const s of stores.splice(0))s.close();});
async function setup(){
  const store=new Store(':memory:');stores.push(store);
  store.saveBrief('deck','Test',{audience:'担当者',message:'条件を理解する'});
  const controller=new Controller({store,browsers:[],openPresentation:()=>{},
    auth:{hasClient:()=>true,isConnected:()=>true,hasAllScopes:()=>true} as unknown as GoogleAuth,
    slides:{presentation:async()=>({title:'Test',size:{width:960,height:540},parents:{page:{}}}),page:async()=>({objectId:'page',pageElements:[]}),thumbnail:async()=>null} as unknown as SlidesClient,
    drive:{} as DriveClient,renderVariant:async()=>({problems:[],images:[{label:'案',base64:'AA==',mimeType:'image/png'}]})});
  await new Promise<void>(resolve=>{const off=controller.subscribe(s=>{if(s.page){off();resolve();}});controller.onLocation('deck','page');});
  const {requestId}=await controller.currentPageForConversation(undefined);
  const variant:VariantInput={requestId,aim:'条件を一言で示す',gaveUp:'詳しい経緯',technique:'takahashi',frames:[{elements:[{id:'t',type:'text',text:'承認後に支払う',x:50,y:50,w:500,h:80,size:32,invented:false}]}]};
  return {store,controller,variant};
}
describe('generation acceptance',()=>{
  it('cannot store an unseen draft or a draft with a semantic rejection; re-rendered correction can pass',async()=>{
    const {controller,store,variant}=await setup();
    expect((await controller.submitVariant(variant)).join()).toContain('preview_variant');
    let accept=false,reviewCalls=0;
    (controller as unknown as {runner:unknown}).runner={run:async(prompt:string)=>{
      reviewCalls++;
      const requestId=/requestId "([^"]+)"/.exec(prompt)![1]!;
      expect((await controller.pageImages(requestId)).length).toBe(1);
      const errors=await controller.submitVariantReview({requestId,verdict:accept?'accept':'revise',issues:accept?[]:['1枚目の断定を元資料の条件に合わせてください'],evidence:'1枚目の条件の文と元資料の条件を照合した'});
      expect(errors).toEqual([]);return {ok:true,seconds:1,models:['test']};
    }};
    const first=await controller.previewVariant(variant);
    expect((await controller.submitVariant({...variant,previewToken:first.previewToken,visualReview:'注目する条件を大きく示した'})).join()).toContain('元資料の条件');
    expect(store.listVariants('deck','page')).toHaveLength(0);
    accept=true;
    const edited={...variant,frames:[{elements:[{...variant.frames[0]!.elements[0]!,text:'上長の承認後に支払う'}]}]};
    expect((await controller.submitVariant({...edited,previewToken:first.previewToken,visualReview:'条件を修正した'})).join()).toContain('preview_variant');
    expect(reviewCalls).toBe(1);
    const second=await controller.previewVariant(edited);
    expect(await controller.submitVariant({...edited,previewToken:second.previewToken,visualReview:'条件を元資料の言葉へ修正した'})).toEqual([]);
    expect(store.listVariants('deck','page')[0]?.independentReview).toContain('照合');
    expect((await controller.submitVariant({...edited,previewToken:second.previewToken,visualReview:'条件を修正した'})).join()).toContain('preview_variant');
  });
});
