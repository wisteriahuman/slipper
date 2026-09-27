// Explicit opt-in: creates one synthetic QA presentation; never edits an existing presentation.
import {app} from 'electron';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {GoogleAuth} from '../src/main/google/oauth';
import {SlidesClient} from '../src/main/google/slides-client';
import {planSequence} from '../src/main/google/convert';
import {renderVariant} from '../src/main/variant-preview';
import type {VariantInput} from '../src/shared/element';

app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  if (process.env.SLIPPER_EVAL_GOOGLE !== '1') throw new Error('Set SLIPPER_EVAL_GOOGLE=1 to create a synthetic Google QA presentation');
  const output=resolve(process.env.SLIPPER_WRITEBACK_OUTPUT ?? '/tmp/slipper-writeback-eval');
  const input=JSON.parse(readFileSync(resolve(process.env.SLIPPER_EVAL_OUTPUT ?? '/tmp/slipper-generation-reviewed','results.json'),'utf8'));
  const variants:VariantInput[]=input.results.flatMap((r:{variants:VariantInput[]})=>r.variants);
  if (!variants.length) throw new Error('No generated variants to verify');
  const auth=new GoogleAuth(resolve(homedir(),'Library/Application Support/slipper'));
  if (!auth.hasClient() || !auth.isConnected()) throw new Error('Existing Slipper Google connection is required');
  const res=await fetch('https://slides.googleapis.com/v1/presentations',{method:'POST',headers:{Authorization:`Bearer ${await auth.accessToken()}`,'Content-Type':'application/json'},body:JSON.stringify({title:`Slipper QA — writeback ${new Date().toISOString()}`})});
  if (!res.ok) throw new Error(`Create QA presentation: ${res.status}`);
  const {presentationId}=await res.json() as {presentationId:string};
  mkdirSync(output,{recursive:true});
  const manifest:{presentationId:string;url:string;pages:unknown[];}={presentationId,url:`https://docs.google.com/presentation/d/${presentationId}/edit`,pages:[]};
  const save=()=>writeFileSync(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2));
  save(); // Keep the created file address even if a later API call fails.
  const slides=new SlidesClient(auth);
  await slides.batchUpdate(presentationId,[{createSlide:{objectId:'qa_source',slideLayoutReference:{predefinedLayout:'BLANK'}}}]);
  const presentation=await slides.presentation(presentationId), page=await slides.page(presentationId,'qa_source');
  const palette={hex:{DARK1:'#000000',DARK2:'#434343',LIGHT1:'#ffffff',LIGHT2:'#eeeeee'},meanings:[]};
  for (const [i,variant] of variants.entries()) {
    const plan=planSequence({page,size:presentation.size,frames:variant.frames.map(f=>f.elements),idPrefix:`qa_v${i}`});
    await slides.batchUpdate(presentationId,plan.requests);
    const local=await renderVariant(variant,{palette,assets:[],decorations:[],pageImage:null,textBoxes:[]});
    for (const [j,id] of plan.newPageIds.entries()) {
      const prefix=`v${i+1}-f${j+1}`;
      writeFileSync(resolve(output,`${prefix}-local.png`),Buffer.from(local.images[j]!.base64,'base64'));
      const google=await slides.thumbnail(presentationId,id);
      writeFileSync(resolve(output,`${prefix}-google.png`),Buffer.from(google.split(',')[1]!,'base64'));
      manifest.pages.push({prefix,pageId:id,technique:variant.technique,aim:variant.aim,localProblems:local.problems});save();
    }
    console.log('Verified writeback',i+1,variant.technique,plan.newPageIds.length);
  }
  console.log(manifest.url);app.quit();
}).catch(e=>{console.error(e);app.exit(1);});
