import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lint,clone,changeElement,toGoogleRequests,W,H} from '../public/model.js';
// A tiny deck unrelated to any sample: the engine must work from deck data alone.
const deck={title:'Quarterly review',colors:{bg:{hex:'#ffffff',name:'Background'},text:{hex:'#111111',name:'Text'},alert:{hex:'#dd2200',name:'Alert'}},
 rules:[{id:'bg',check:{bg:'bg'},rule:'Same background',why:'x'},{id:'late',check:{role:'alert',notBefore:1},rule:'No alert on the cover',why:'x'},{id:'few',check:{role:'alert',max:1},rule:'One alert per page',why:'x'},{id:'note',rule:'Guidance only',why:'x'}],
 pages:[0,1].map(i=>({name:'p'+i,role:'r',original:'',variants:[{label:'v',note:'',rationale:[],scene:{bg:'bg',elements:[{id:'title',type:'text',text:'Hello',x:64,y:64,w:500,h:60,size:40,color:'text'},{id:'mark',type:'box',x:64,y:200,w:40,h:40,fill:'text'}]}}]}))};
const scene=deck.pages[0].variants[0].scene;
test('moving objects clamps to canvas and preserves source',()=>{const next=changeElement(scene,'title',{x:900,y:-50});assert.equal(next.elements[0].x,W-500);assert.equal(next.elements[0].y,0);assert.equal(scene.elements[0].x,64);});
test('locked element resists position and text edits',()=>{const s=clone(scene);s.elements[0].locked=true;assert.deepEqual(changeElement(s,'title',{x:20,text:'replaced'}),s);});
test('lint evaluates only the checks the deck declares',()=>{
 assert.deepEqual(lint(deck,scene,0),[]);
 assert.deepEqual(lint(deck,{...scene,bg:'text'},0).map(x=>x.id),['bg']);
 const alert=changeElement(scene,'mark',{fill:'alert'});
 assert.deepEqual(lint(deck,alert,0).map(x=>x.id),['late']);
 assert.deepEqual(lint(deck,alert,1),[]);
 const two=changeElement(alert,'title',{color:'alert'});
 assert.deepEqual(lint(deck,two,1).map(x=>x.id),['few']);
});
test('Google export resolves roles to the deck colors, for any page count',()=>{const requests=toGoogleRequests([scene,scene],deck.colors);assert.equal(requests.filter(r=>r.createSlide).length,2);const creates=requests.filter(r=>r.createShape);assert.equal(new Set(creates.map(r=>r.createShape.objectId)).size,4);assert.equal(creates[0].createShape.elementProperties.transform.translateX,48);const fill=requests.find(r=>r.updateShapeProperties?.shapeProperties.shapeBackgroundFill?.solidFill).updateShapeProperties.shapeProperties.shapeBackgroundFill.solidFill.color.rgbColor;assert.deepEqual(fill,{red:17/255,green:17/255,blue:17/255});});
test('empty text exports without invalid empty insertText requests',()=>{const s=clone(scene);s.elements=[{...s.elements[0],text:''}];assert.equal(toGoogleRequests([s],deck.colors).filter(r=>r.insertText).length,0);});
test('engine and app contain no deck-specific content',async()=>{for(const f of ['public/model.js','public/app.js']){const src=await readFile(f,'utf8');for(const word of ['フリふる','空き','free'])assert.ok(!src.includes(word),`${f} mentions ${word}`);}});
