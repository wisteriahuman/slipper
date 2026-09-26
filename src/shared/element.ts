import {z} from 'zod';
import type {ProposalPlan} from './proposal-plan';

export {CANVAS} from './canvas';

export const ElementSchema = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  type: z.enum(['text', 'shape', 'asset']).describe('asset = 元のページの素材（画像・表・グラフ）。assetId で参照し、中身は変えない'),
  shape: z.enum(['rect', 'roundRect', 'ellipse', 'line']).optional().describe('type が shape のときの形'),
  text: z.string().max(2000).optional(),
  size: z.number().min(8).max(120).optional().describe('文字サイズ（px）'),
  bold: z.boolean().optional(),
  color: z.string().optional().describe('文字色。テーマ色の名前（DARK1, LIGHT1, DARK2, LIGHT2, ACCENT1〜6）'),
  fill: z.string().optional().describe('図形の塗り。テーマ色の名前'),
  opacity: z.number().min(0.1).max(1).optional().describe('図形の塗りの不透明度（1で不透明）。画面を覆って暗くするときなどに使う'),
  assetId: z.string().optional(),
  x: z.number(), y: z.number(), w: z.number().positive(), h: z.number().positive(),
  invented: z.boolean().describe('元のページにない内容（架空の場面・例の数値など）なら true'),
  locked: z.boolean().optional()
});
export type SlideElement = z.infer<typeof ElementSchema>;

// A variant is 1 to 3 consecutive slides. Later slides keep the same layout and change one thing,
// which is how a talk shows things over time (build up, shift focus, cover and state, ...).
export const FrameSchema = z.object({elements: z.array(ElementSchema).min(1).max(40)});
export type Frame = z.infer<typeof FrameSchema>;

export const VariantInputShape = {
  requestId: z.string(),
  aim: z.string().min(4).max(80).describe('狙い：この案が聞き手に何をしようとしているか（1行）'),
  gaveUp: z.string().min(2).max(80).describe('捨てたもの：この案が諦めたこと（1行）'),
  technique: z.string().max(40).describe('主な手法の id'),
  supportingTechniques: z.array(z.string().max(40)).max(2).optional().describe('補助として組み合わせる手法の id'),
  frames: z.array(FrameSchema).min(1).max(3).describe('スライドの並び。1枚で足りるなら1枚。固定・拡大縮小・場面転換など、選んだ手法に合う連続にする')
};
export const VariantInputSchema = z.object(VariantInputShape);
export type VariantInput = z.infer<typeof VariantInputSchema>;

// technique is optional on stored variants: ones made before the catalog existed don't have it.
export type Variant = Omit<VariantInput, 'technique'> & {technique?: string; id: string; approach: string | null; receivedAt: number; plan?: ProposalPlan; visualReview?: string; independentReview?: string};
