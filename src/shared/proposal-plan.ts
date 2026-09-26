import {z} from 'zod';
import {techniqueById} from './techniques';
import {recipeFor} from './technique-recipes';

export const ProposalPlanSchema = z.object({
  aim: z.string().min(4).max(80).describe('聞き手の理解・判断・感情をどう変えるか。手法名ではなく、この題材に固有の狙い'),
  technique: z.string().max(40),
  supportingTechniques: z.array(z.string().max(40)).max(2).optional(),
  reason: z.string().min(8).max(300).describe('なぜこの内容・聞き手に効くか。必要な材料が存在する根拠も書く'),
  evidence: z.array(z.string()).min(1).max(30).describe('根拠にした文字・素材のid（全体の流れではpageId）'),
  treatment: z.string().min(8).max(400).describe('具体的に何を見せ、何を残し、何を変えるか。素材不足を事実や画像の捏造で埋めない')
});
export type ProposalPlan = z.infer<typeof ProposalPlanSchema>;
export const PlanInputShape = {requestId: z.string(), proposals: z.array(ProposalPlanSchema).length(3)};
export const PlanInputSchema = z.object(PlanInputShape);
export type PlanInput = z.infer<typeof PlanInputSchema>;
export const PLAN_PAGE = '__plan_page__';
export const PLAN_FLOW = '__plan_flow__';
export function validatePlan(input: PlanInput, level: 'page' | 'flow', sourceIds: string[]): string[] {
  const problems: string[] = [];
  if (new Set(input.proposals.map(p => p.aim.replace(/\s/g, ''))).size !== 3) problems.push('3案の狙いを別々にしてください');
  if (new Set(input.proposals.map(p => p.technique)).size !== 3) problems.push('3案は異なる主な手法を使ってください');
  for (const p of input.proposals) {
    const t = techniqueById(p.technique);
    if (!t || t.level !== level || !recipeFor(t.id).available) problems.push(`使えない主な手法: ${p.technique}`);
    for (const id of p.supportingTechniques ?? []) if (id === p.technique || techniqueById(id)?.level !== 'page' || !recipeFor(id).available) problems.push(`使えない補助の手法: ${id}`);
    for (const id of p.evidence) if (!sourceIds.includes(id)) problems.push(`根拠にした素材・ページが存在しません: ${id}`);
  }
  return problems;
}
