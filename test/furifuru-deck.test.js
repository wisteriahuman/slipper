import test from 'node:test';
import assert from 'node:assert/strict';
import {lint,roleOf,W,H} from '../public/model.js';
import deck from '../public/decks/furifuru.js';
// Checks that the sample deck lives up to its own stated design rules.
const variants=deck.pages.flatMap((p,page)=>p.variants.map(v=>({...v,page})));
test('all sample elements fit within a 16:9 slide',()=>{for(const v of variants)for(const e of v.scene.elements)assert.ok(e.x>=0&&e.y>=0&&e.x+e.w<=W&&e.y+e.h<=H,`${v.label}: ${e.id}`);});
test('samples use only the deck color roles and pass its rules',()=>{for(const v of variants){for(const e of v.scene.elements)assert.ok(Object.hasOwn(deck.colors,roleOf(e)),`${v.label}: ${e.id}`);assert.deepEqual(lint(deck,v.scene,v.page),[],v.label);}});
test('every accent use is explained, and every explanation points at real elements',()=>{for(const v of variants){assert.ok(v.rationale.length>=2,v.label);const ids=new Set(v.scene.elements.map(e=>e.id)),explained=new Set(v.rationale.flatMap(x=>x.ids));for(const x of v.rationale){assert.ok(x.what&&x.why,v.label);for(const id of x.ids)assert.ok(ids.has(id),`${v.label}: ${id}`);}for(const e of v.scene.elements)if(roleOf(e)==='free')assert.ok(explained.has(e.id),`${v.label}: ${e.id} uses free without a reason`);}});
test('recurring objects keep the same shape across pages',()=>{const geo=(v,id)=>{const {x,y,w,h}=v.scene.elements.find(e=>e.id===id);return {x,y,w,h};};const p=deck.pages;for(const id of ['bubble','send'])assert.deepEqual(geo(p[0].variants[0],id),geo(p[2].variants[2],id));for(const id of ['me','card0','card1','card2'])assert.deepEqual(geo(p[0].variants[2],id),geo(p[1].variants[0],id));});
