import {z} from 'zod';

export const RefineTextSchema = z.object({snapshotId: z.string(), elementId: z.string(), text: z.string().min(1).max(6000), direction: z.string().min(1).max(300)}).strict();
export type RefineTextInput = z.infer<typeof RefineTextSchema>;
export const TextOptionSchema = z.object({label: z.string().min(1).max(50), text: z.string().min(1).max(6000), reason: z.string().min(1).max(250)}).strict();
export const TextRefinementShape = {requestId: z.string(), options: z.array(TextOptionSchema).min(2).max(3)};
export const TextRefinementSchema = z.object(TextRefinementShape).strict();
export type TextRefinement = z.infer<typeof TextRefinementSchema>;
export type TextOption = z.infer<typeof TextOptionSchema>;
export type RefineTextResult = {ok: boolean; message: string; options?: TextOption[]};
export const TextReviewShape = {requestId: z.string(), accepted: z.array(z.number().int().min(0).max(2)).max(3), rejected: z.array(z.object({index: z.number().int().min(0).max(2), reason: z.string().min(1).max(300)})).max(3)};
export const TextReviewSchema = z.object(TextReviewShape).strict();
export type TextReview = z.infer<typeof TextReviewSchema>;

export function numericFacts(text: string): string[] {
  return [...new Set(text.normalize('NFKC').match(/\d+(?:[.,]\d+)*%?/g) ?? [])].sort();
}
