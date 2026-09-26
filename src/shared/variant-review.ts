import {z} from 'zod';
export const VariantReviewShape = {
  requestId: z.string(),
  verdict: z.enum(['accept', 'revise']),
  issues: z.array(z.string().min(8).max(400)).max(5),
  evidence: z.string().min(12).max(1200).describe('画像と元資料のどの箇所を確かめたか。好みの採点はしない')
};
export const VariantReviewSchema = z.object(VariantReviewShape).superRefine((v, ctx) => {
  if ((v.verdict === 'accept') !== (v.issues.length === 0)) ctx.addIssue({code:'custom',message:'accept は問題なし、revise は具体的な問題を1つ以上書く'});
});
export type VariantReview = z.infer<typeof VariantReviewSchema>;
