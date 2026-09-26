// Reproducible local evaluation. Uses synthetic source material and an isolated SQLite database;
// exercises the real Controller, MCP server, Claude runner and Electron renderer. No Google writes.
import {app} from 'electron';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Controller} from '../src/main/controller';
import {Store} from '../src/main/store';
import {SlipperMcpServer} from '../src/main/mcp-server';
import {renderVariant, type PreviewContext} from '../src/main/variant-preview';
import type {ApiPage} from '../src/main/google/convert';
import type {GoogleAuth} from '../src/main/google/oauth';
import type {SlidesClient} from '../src/main/google/slides-client';
import type {DriveClient} from '../src/main/google/drive-client';
import type {VariantInput, SlideElement} from '../src/shared/element';

const output = resolve(process.env.SLIPPER_EVAL_OUTPUT ?? '/tmp/slipper-generation-eval');
const palette = {hex:{DARK1:'#202020',DARK2:'#555555',LIGHT1:'#ffffff',LIGHT2:'#eeeeee'},meanings:[]};
const fixtures = [
  {id:'numbers', audience:'業務改善の担当者',message:'試行した受付方法の効果と限界を判断する',title:'受付時間の比較', lines:['同じ窓口で各方式100件を計測','従来：平均12分／新方式：平均7分','測定期間：各1週間。繁忙期は未検証','新方式では入力項目を事前に確認する']},
  {id:'mechanism',audience:'初めて使う社員',message:'承認が完了する条件を理解する',title:'申請から承認まで',lines:['社員が申請する → 上長が確認する → 経理が支払う','不備があれば上長が差し戻す','上長の承認前に、経理は支払わない','差し戻された社員は修正して再申請する']},
  {id:'operation',audience:'初めて予約する利用者',message:'予約の手順と確定するタイミングを理解する',title:'会議室を予約する',lines:['1. 空き時間を選ぶ','2. 参加人数を入力する','3. 「予約を確定」を押す','時間を選んだだけでは予約されない。確定後に確認メールが届く']},
  {id:'proposal',audience:'施策の採否を決める責任者',message:'全面導入の前に小さく試す理由と実施条件を判断する',title:'サポート窓口の時間延長を試したい',lines:['直近30日の問い合わせ120件中、営業時間外は24件','営業時間外の問い合わせは翌営業日に返信している','提案：金曜だけ2時間延長し、4週間試す','見る指標：初回返信までの時間と担当者の追加勤務時間','採否の基準値は責任者と決める。効果の実績はまだない']}
];
const t=(id:string,text:string,y:number,size=26):SlideElement=>({id,type:'text',text,x:60,y,w:840,h:65,size,color:'DARK1',invented:false});
const sources = fixtures.map(f=>({f,elements:[t('title',f.title,35,36),...f.lines.map((l,i)=>t(`text${i}`,l,125+i*77,24))]}));
const apiPage=(id:string,elements:SlideElement[]):ApiPage=>({objectId:id,pageElements:elements.map(e=>({objectId:e.id,size:{width:{magnitude:e.w,unit:'EMU'},height:{magnitude:e.h,unit:'EMU'}},transform:{scaleX:1,scaleY:1,translateX:e.x,translateY:e.y,unit:'EMU'},shape:{shapeType:'TEXT_BOX',text:{textElements:[{textRun:{content:e.text,style:{fontSize:{magnitude:18,unit:'PT'}}}}]}}}))});
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  mkdirSync(output,{recursive:true});
  const context:PreviewContext={palette,assets:[],decorations:[],pageImage:null,textBoxes:[]};
  const thumbnails=new Map<string,string>();
  for(const {f,elements} of sources){
    const image=(await renderVariant({requestId:f.id,aim:'元の資料',gaveUp:'なし',technique:'takahashi',frames:[{elements}]},context)).images[0]!;
    thumbnails.set(f.id,`data:image/png;base64,${image.base64}`);writeFileSync(resolve(output,`${f.id}-original.png`),Buffer.from(image.base64,'base64'));
  }
  // Verify the actual renderer reports clipping, including Japanese text.
  const clipped=await renderVariant({requestId:'clip',aim:'文字切れの検査',gaveUp:'確認用',technique:'takahashi',frames:[{elements:[{...t('long','長い説明が一つの小さな枠に入り切らないことを確認する',100,36),w:80,h:30}]}]},context);
  if(!clipped.problems.some(p=>p.includes('はみ出し'))) throw new Error('Renderer did not detect clipping');
  console.log('Renderer clipping detected');
  if(process.env.SLIPPER_EVAL_LIVE!=='1'){app.quit();return;}
  const store=new Store(':memory:');
  const fakeSlides={
    presentation:async(id:string)=>({title:id,size:{width:960,height:540},parents:Object.fromEntries(sources.map(x=>[x.f.id,{}])),colorScheme:{colors:[{type:'DARK1',color:{red:0.12,green:0.12,blue:0.12}},{type:'DARK2',color:{red:0.33,green:0.33,blue:0.33}},{type:'LIGHT1',color:{red:1,green:1,blue:1}},{type:'LIGHT2',color:{red:0.93,green:0.93,blue:0.93}}]}}),
    page:async(_id:string,page:string)=>{const x=sources.find(x=>x.f.id===page)!;return apiPage(page,x.elements);},
    thumbnail:async(_id:string,page:string)=>thumbnails.get(page)!,
    allSlides:async()=>sources.map(x=>apiPage(x.f.id,x.elements)),
    batchUpdate:async()=>{throw new Error('Evaluation must not write to Google');}
  } as unknown as SlidesClient;
  const events:unknown[]=[];
  const controller=new Controller({store,auth:{hasClient:()=>true,isConnected:()=>true,hasAllScopes:()=>true} as unknown as GoogleAuth,slides:fakeSlides,drive:{} as DriveClient,browsers:[],openPresentation:()=>{},renderVariant:async(v,c)=>{
    const r=await renderVariant(v,c);events.push({kind:'preview',requestId:v.requestId,technique:v.technique,problems:r.problems});
    console.log('Preview',v.technique,r.problems.length ? r.problems.join(';') : 'ok');return r;
  }});
  const server=new SlipperMcpServer({submitVariantReview:r=>controller.submitVariantReview(r),currentPage:d=>controller.currentPageForConversation(d),pageImages:id=>controller.pageImages(id),submitProposalPlan:async p=>{events.push({kind:'plan',...p});return controller.submitProposalPlan(p);},previewVariant:v=>controller.previewVariant(v),submitVariant:async v=>{const r=await controller.submitVariant(v);events.push({kind:'submit',requestId:v.requestId,visualReview:v.visualReview,problems:r});return r;},submitStoryline:s=>controller.submitStoryline(s),submitDeckReading:r=>controller.submitDeckReading(r),submitPageReading:r=>controller.submitPageReading(r)});
  await server.start();controller.attachMcp(server.url,server.token);
  const results:unknown[]=[];
  try{
    for(const {f} of sources.filter(x=>!process.env.SLIPPER_EVAL_CASES || process.env.SLIPPER_EVAL_CASES.split(',').includes(x.f.id))){
      store.saveBrief(f.id,f.title,{audience:f.audience,message:f.message,context:'説明する発表'});
      controller.onLocation(f.id,f.id);
      await new Promise<void>((resolve,reject)=>{if(controller.getState().page?.pageId===f.id){resolve();return;}const timeout=setTimeout(()=>{unsub();reject(new Error('load timeout'));},5000);const unsub=controller.subscribe(s=>{if(s.page?.pageId===f.id){clearTimeout(timeout);unsub();resolve();}});});
      console.log('START',f.id);
      const result=await controller.requestVariants({direction:'',deep:false});
      const variants=store.listVariants(f.id,f.id);
      results.push({fixture:f,result,count:variants.length,variants});
      if (!result.ok || variants.length !== 3) process.exitCode = 1;
      for(const [i,v] of variants.entries()){
        const rendered=await renderVariant(v as VariantInput,context);
        for(const [j,im] of rendered.images.entries())writeFileSync(resolve(output,`${f.id}-v${i+1}-f${j+1}.png`),Buffer.from(im.base64,'base64'));
      }
      writeFileSync(resolve(output,'results.json'),JSON.stringify({results,events},null,2));
      console.log('DONE',f.id,variants.length,result.message,controller.getState().notices);
    }
  }finally{controller.dispose();server.stop();store.close();app.quit();}
}).catch(e=>{console.error(e);app.exit(1);});
