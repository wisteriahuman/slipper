import {recipeFor} from './technique-recipes';
import {techniqueById} from './techniques';
import {CANVAS, type SlideElement, type VariantInput} from './element';
import {allowedColors, MAX_ACCENT_USES, needsMeaning, type Palette} from './palette';

// Half a pixel of slack so rounding in the model's arithmetic isn't reported as overflow.
const SLACK = 0.5;
// Elements carried over between consecutive slides must stay put, within this tolerance (px).
const SAME_PLACE = 1;

export type ValidationContext = {assetIds: string[]; palette: Palette};

function validateFrame(elements: SlideElement[], ctx: ValidationContext, label: string): string[] {
  const problems: string[] = [];
  const allowed = allowedColors(ctx.palette);
  const seen = new Set<string>();
  let accentUses = 0;
  const assets = new Set<string>();
  for (const e of elements) {
    const at = `${label}${e.id}`;
    if (seen.has(e.id)) problems.push(`${at}: id が重複しています`);
    seen.add(e.id);
    if (e.x < -SLACK || e.y < -SLACK || e.x + e.w > CANVAS.width + SLACK || e.y + e.h > CANVAS.height + SLACK)
      problems.push(`${at}: キャンバス（${CANVAS.width}×${CANVAS.height}）からはみ出しています`);
    if (e.type === 'text' && !e.text?.trim()) problems.push(`${at}: text がありません`);
    if (e.type === 'shape' && !e.shape) problems.push(`${at}: shape がありません`);
    if (e.type === 'asset' && !ctx.assetIds.includes(e.assetId ?? '')) problems.push(`${at}: 存在しない assetId です`);
    if (e.type === 'asset' && e.assetId) {
      if (assets.has(e.assetId)) problems.push(`${at}: 同じ素材の複数配置にはまだ対応していません`);
      assets.add(e.assetId);
    }
    let usesAccent = false;
    for (const ref of [e.color, e.fill]) {
      if (!ref) continue;
      if (!allowed.includes(ref)) {
        problems.push(needsMeaning(ctx.palette, ref)
          ? `${at}: ${ref}（${ctx.palette.hex[ref] ?? '色味あり'}）は意味が決まっていない色なので使えません。文字の大きさ・太さ・余白で強調してください`
          : `${at}: ${ref} は使えない色です。使える色: ${allowed.join(', ')}`);
      } else if (needsMeaning(ctx.palette, ref)) usesAccent = true;
    }
    if (usesAccent) accentUses++;
  }
  if (accentUses > MAX_ACCENT_USES) problems.push(`${label}色味のある色が ${accentUses} か所で使われています。${MAX_ACCENT_USES} か所までにしてください`);
  return problems;
}

// Consecutive slides read as one moving picture only if what stays, stays in place.
export function validateContinuity(prev: SlideElement[], next: SlideElement[], label: string, technique = 'build-up'): string[] {
  const mode = recipeFor(technique).continuity ?? 'fixed';
  if (mode === 'scene') return [];
  const problems: string[] = [];
  const byId = new Map(next.map(e => [e.id, e]));
  const kept = prev.filter(e => byId.has(e.id));
  if (mode === 'zoom-in' || mode === 'zoom-out') {
    const anchors = kept.filter(a => a.type !== 'text' && next.find(b => b.id === a.id)?.type === a.type);
    const scales = anchors.map(a => { const b = byId.get(a.id)!; return {x: b.w / a.w, y: b.h / a.h}; });
    if (!scales.some(s => mode === 'zoom-in' ? s.x > 1.15 && s.y > 1.15 : s.x < 0.87 && s.y < 0.87))
      problems.push(`${label}同じ id の図・画像を${mode === 'zoom-in' ? '拡大' : '縮小'}して、視点の変化を見せてください`);
    for (const s of scales) if (Math.abs(s.x / s.y - 1) > 0.05) problems.push(`${label}拡大縮小では縦横比を保ってください`);
    return problems;
  }
  if (mode === 'data') {
    if (!kept.length) problems.push(`${label}軸や凡例など、比較の基準となる要素を引き継いでください`);
    return problems;
  }
  for (const a of kept) {
    const b = byId.get(a.id)!;
    if (Math.abs(a.x - b.x) > SAME_PLACE || Math.abs(a.y - b.y) > SAME_PLACE || Math.abs(a.w - b.w) > SAME_PLACE || Math.abs(a.h - b.h) > SAME_PLACE)
      problems.push(`${label}${a.id}: 前のページと位置や大きさが違います。連続では同じ要素を同じ位置に置き、変える部分だけを足してください`);
  }
  if (kept.length < Math.ceil(prev.length / 2))
    problems.push(`${label}前のページから引き継いでいる要素が少なすぎます（${kept.length}/${prev.length}）。連続にするなら同じ版面を保ち、別の内容なら1枚目だけにしてください`);
  return problems;
}

// Returns human-readable problems in Japanese, sent back to the AI so it can fix and resend.
export function validateVariant(v: VariantInput, ctx: ValidationContext): string[] {
  const multi = v.frames.length > 1;
  const label = (i: number) => (multi ? `${i + 1}枚目 ` : '');
  const recipe = recipeFor(v.technique);
  const problems: string[] = [];
  if (techniqueById(v.technique)?.slides === '2-3' && !multi) problems.push('この手法は2〜3枚の連続で示してください');
  for (const id of v.supportingTechniques ?? []) if (id === v.technique || techniqueById(id)?.level !== 'page' || !recipeFor(id).available) problems.push(`使えない補助の手法: ${id}`);
  if (!recipe.available && techniqueById(v.technique)) problems.push('この手法の成立条件にはまだ対応していません');
  return [...problems, ...v.frames.flatMap((f, i) => [
    ...validateFrame(f.elements, ctx, label(i)),
    ...(i > 0 ? validateContinuity(v.frames[i - 1]!.elements, f.elements, label(i), v.technique) : [])
  ])];
}
