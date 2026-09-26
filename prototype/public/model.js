export const W = 960, H = 540;
// The engine knows nothing about any particular deck. A deck supplies:
//  colors: {role: {hex, name, means}} — elements refer to roles, never to raw hex values
//  rules:  [{id, rule, why, check?}] — check is optional data the linter can evaluate
//  pages:  [{name, role, original, variants: [{label, tag, note, scene, rationale: [{ids, what, why}]}]}]
export const colorHex = (colors, role) => colors[role]?.hex ?? '#000000';
export const roleOf = e => e.type==='text' ? e.color : e.fill;
export const clone = value => structuredClone(value);
export const clamp = (v,min,max) => Math.min(max,Math.max(min,v));
export function changeElement(scene,id,patch) {
 const next=clone(scene), el=next.elements.find(e=>e.id===id);
 if(!el || el.locked) return next;
 Object.assign(el,patch);
 el.w=clamp(el.w,16,W); el.h=clamp(el.h,16,H);
 el.x=clamp(el.x,0,W-el.w); el.y=clamp(el.y,0,H-el.h);
 return next;
}
// Checks a slide against the deck's rules, like a linter: returns which rule broke and where.
// Supported checks: {bg: role} / {role, notBefore: pageIndex} / {role, max: count}.
export function lint(deck,scene,pageIndex) {
 const issues=[];
 for(const r of deck.rules) {
  const c=r.check; if(!c) continue;
  const ids=c.role?scene.elements.filter(e=>roleOf(e)===c.role).map(e=>e.id):[];
  if(c.bg!==undefined && scene.bg!==c.bg) issues.push({...r,ids:[]});
  else if(c.notBefore!==undefined && pageIndex<c.notBefore && ids.length) issues.push({...r,ids});
  else if(c.max!==undefined && ids.length>c.max) issues.push({...r,ids});
 }
 return issues;
}
export function rgb(value) { const h=value.replace('#',''); return {red:parseInt(h.slice(0,2),16)/255,green:parseInt(h.slice(2,4),16)/255,blue:parseInt(h.slice(4,6),16)/255}; }
// Native Slides objects: 960 × 540 design coordinates become 720 × 405 points.
export function toGoogleRequests(scenes, colors, stamp='slipper') {
 const requests=[], hex=role=>colorHex(colors,role);
 scenes.forEach((s,i)=>{
  const slideId=`${stamp}_slide_${i}`;
  requests.push({createSlide:{objectId:slideId,slideLayoutReference:{predefinedLayout:'BLANK'}}});
  requests.push({updatePageProperties:{objectId:slideId,pageProperties:{pageBackgroundFill:{solidFill:{color:{rgbColor:rgb(hex(s.bg))},alpha:1}}},fields:'pageBackgroundFill'}});
  s.elements.forEach((e,j)=>{
   const id=`${stamp}_s${i}_e${j}`;
   requests.push({createShape:{objectId:id,shapeType:e.type==='text'?'TEXT_BOX':e.radius?'ROUND_RECTANGLE':'RECTANGLE',elementProperties:{pageObjectId:slideId,size:{width:{magnitude:e.w*.75,unit:'PT'},height:{magnitude:e.h*.75,unit:'PT'}},transform:{scaleX:1,scaleY:1,translateX:e.x*.75,translateY:e.y*.75,unit:'PT'}}}});
   if(e.type==='text') {
    if(e.text) {
     requests.push({insertText:{objectId:id,text:e.text,insertionIndex:0}});
     requests.push({updateTextStyle:{objectId:id,textRange:{type:'ALL'},style:{fontFamily:'Arial',fontSize:{magnitude:e.size*.75,unit:'PT'},bold:!!e.bold,foregroundColor:{opaqueColor:{rgbColor:rgb(hex(e.color))}}},fields:'fontFamily,fontSize,bold,foregroundColor'}});
     requests.push({updateParagraphStyle:{objectId:id,textRange:{type:'ALL'},style:{spaceAbove:{magnitude:0,unit:'PT'},spaceBelow:{magnitude:0,unit:'PT'},lineSpacing:112},fields:'spaceAbove,spaceBelow,lineSpacing'}});
    }
    requests.push({updateShapeProperties:{objectId:id,shapeProperties:{contentAlignment:'TOP',outline:{propertyState:'NOT_RENDERED'},shapeBackgroundFill:{propertyState:'NOT_RENDERED'}},fields:'contentAlignment,outline,shapeBackgroundFill'}});
   } else requests.push({updateShapeProperties:{objectId:id,shapeProperties:{shapeBackgroundFill:{solidFill:{color:{rgbColor:rgb(hex(e.fill))},alpha:1}},outline:{propertyState:'NOT_RENDERED'}},fields:'shapeBackgroundFill,outline'}});
  });
 });
 return requests;
}
