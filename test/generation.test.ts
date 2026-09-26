import {describe, expect, it} from 'vitest';
import {validateVariant} from '../src/shared/validate';
import type {VariantInput, SlideElement} from '../src/shared/element';
import {validateStoryline} from '../src/shared/storyline';
import {validatePlan, type PlanInput} from '../src/shared/proposal-plan';
import {PreviewReviews} from '../src/main/preview-review';

const shape: SlideElement = {id:'point', type:'shape', shape:'ellipse', fill:'DARK1', x:100,y:100,w:100,h:100,invented:false};
const draft = (technique: string, frames: SlideElement[][]): VariantInput => ({requestId:'r',aim:'課題の位置を理解する',gaveUp:'一覧性',technique,frames:frames.map(elements=>({elements}))});
const ctx = {assetIds:[],palette:{hex:{DARK1:'#000000',LIGHT1:'#ffffff'},meanings:[]}};
describe('technique-aware sequences', () => {
  it('allows a real zoom-out but rejects a stationary reveal and distorted zoom', () => {
    expect(validateVariant(draft('zoom-out',[[shape],[{...shape,x:500,y:300,w:20,h:20}]]),ctx)).toEqual([]);
    expect(validateVariant(draft('zoom-out',[[shape],[shape]]),ctx).join()).toContain('縮小');
    expect(validateVariant(draft('zoom-out',[[shape],[{...shape,w:20,h:30}]]),ctx).join()).toContain('縦横比');
  });
  it('allows scene cuts for Lessig and segmentation, while fixed builds cannot jump', () => {
    const next = {...shape,id:'different',x:300};
    expect(validateVariant(draft('lessig',[[shape],[next]]),ctx)).toEqual([]);
    expect(validateVariant(draft('segmenting',[[shape],[next]]),ctx)).toEqual([]);
    expect(validateVariant(draft('build-up',[[shape],[{...shape,x:300}]]),ctx).join()).toContain('位置');
  });
});
describe('render receipts', () => {
  it('rejects unrendered, changed, failed, and replayed drafts', () => {
    const reviews = new PreviewReviews(), v = draft('takahashi',[[shape]]);
    expect(reviews.accepts(v,undefined)).toBe(false);
    const token = reviews.record(v,[]);
    expect(reviews.accepts(v,token)).toBe(true);
    expect(reviews.accepts({...v,frames:[{elements:[{...shape,w:90}]}]},token)).toBe(false);
    expect(reviews.record(v,['文字切れ'])).toBeUndefined();
    expect(reviews.accepts(v,token)).toBe(false);
    const token2 = reviews.record(v,[]); reviews.clear(v.requestId);
    expect(reviews.accepts(v,token2)).toBe(false);
  });
});
describe('story structure', () => {
  const steps = ['前提（And）','転換（But）','帰結（Therefore）'];
  const s = {requestId:'r',technique:'abt',aim:'課題を理解する',gaveUp:'網羅性',fromCurrent:'結論を最後へ',slides:steps.map((step,i)=>({role:'段の役割',step,source:{kind:'keep' as const,pageId:`p${i}`},note:''}))};
  it('rejects reverse ABT even if every stage exists', () => {
    expect(validateStoryline(s,{pageIds:['p0','p1','p2'],steps})).toEqual([]);
    expect(validateStoryline({...s,slides:[...s.slides].reverse()},{pageIds:['p0','p1','p2'],steps}).join()).toContain('順番');
  });
  it('does not let a new page split an existing sequence', () => {
    const slides = [s.slides[0]!,{role:'補足の問い',source:{kind:'new' as const},note:'なぜか'},...s.slides.slice(1)];
    expect(validateStoryline({...s,slides},{pageIds:['p0','p1','p2'],sequences:[['p0','p1']]}).join()).toContain('隣り合わせ');
  });
});
describe('proposal plans', () => {
  const plan: PlanInput = {requestId:'p',proposals:['takahashi','juxtaposition','open-loop'].map((technique,i)=>({aim:`聞き手に変化${i}を伝える`,technique,reason:'資料にある事実を根拠にする',evidence:['source'],treatment:'主張と比較の対象を具体的に見せる'}))};
  it('accepts grounded choices but rejects missing sources, duplicate aims and unsupported formats', () => {
    expect(validatePlan(plan,'page',['source'])).toEqual([]);
    expect(validatePlan(plan,'page',[]).join()).toContain('存在しません');
    expect(validatePlan({...plan,proposals:plan.proposals.map(p=>({...p,aim:'同じ狙いを使う'}))},'page',['source']).join()).toContain('狙い');
    expect(validatePlan({...plan,proposals:plan.proposals.map(p=>({...p,technique:'pechakucha'}))},'flow',['source']).join()).toContain('使えない');
  });
});
