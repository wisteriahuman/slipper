import {z} from 'zod';

// A storyline is an alternative flow for the whole deck: an ordered list of page roles, each
// either reusing an original page, merging several, or asking for a new page.
export const StorySlideSchema = z.object({
  role: z.string().min(2).max(60).describe('流れの中でのこのページの役割（1行）。例: 聞き手の経験を思い出させる'),
  step: z.string().max(40).optional().describe('このページが担う、手法の段の名前（手法の steps のどれか）'),
  source: z.discriminatedUnion('kind', [
    z.object({kind: z.literal('keep'), pageId: z.string()}).describe('元のページをそのまま使う'),
    z.object({kind: z.literal('merge'), pageIds: z.array(z.string()).min(2)}).describe('複数の元のページを1枚にまとめる'),
    z.object({kind: z.literal('new')}).describe('新しく作る')
  ]),
  note: z.string().max(140).describe('このページで見せること（1〜2行）。merge と new では必須')
});
export type StorySlide = z.infer<typeof StorySlideSchema>;

export const StorylineInputShape = {
  requestId: z.string(),
  aim: z.string().min(4).max(80).describe('狙い：この流れが聞き手に何をしようとしているか（1行）'),
  gaveUp: z.string().min(2).max(80).describe('捨てたもの：この流れが諦めたこと（1行）'),
  technique: z.string().max(40).describe('この流れで使った構成の手法の id（手法のカタログから）'),
  supportingTechniques: z.array(z.string().max(40)).max(2).optional(),
  fromCurrent: z.string().min(4).max(120).describe('今の流れから変わること（1行）。例: メンバー紹介を削り、感情のグラフを冒頭に移す'),
  slides: z.array(StorySlideSchema).min(2).max(40)
};
export const StorylineInputSchema = z.object(StorylineInputShape);
export type StorylineInput = z.infer<typeof StorylineInputSchema>;
// fromCurrent is optional on stored storylines: ones made before it existed don't have it.
export type Storyline = Omit<StorylineInput, 'fromCurrent' | 'technique'> & {fromCurrent?: string; technique?: string; id: string; approach: string | null; receivedAt: number};

// ctx.steps: the stages of the storyline's technique. Every stage must be carried by some page;
// a stage with no fitting page in the deck is exactly where a new page belongs.
export function validateStoryline(s: StorylineInput, ctx: {pageIds: string[]; steps?: string[]; sequences?: string[][]}): string[] {
  const problems: string[] = [];
  const carried = new Set(s.slides.map(x => x.step).filter(Boolean));
  const missing = (ctx.steps ?? []).filter(step => !carried.has(step));
  if (missing.length) problems.push(`手法の段を担うページがありません: ${missing.join('、')}。各ページの step に段の名前を書き、担う元のページがなければ new で作ってください`);
  for (const x of s.slides) if (x.step && ctx.steps && !ctx.steps.includes(x.step)) problems.push(`step「${x.step}」は手法の段にありません（${ctx.steps.join('、')}）`);
  if (ctx.steps?.length && s.slides.some(x => !x.step)) problems.push('各ページに、担う手法の段を step で指定してください');
  const stages = s.slides.map(x => x.step ? (ctx.steps ?? []).indexOf(x.step) : -1).filter(i => i >= 0);
  if (stages.some((step, i) => i > 0 && step < stages[i - 1]!)) problems.push('手法の段を順番どおりに進めてください');
  for (const sequence of ctx.sequences ?? []) {
    const used = s.slides.some(x => x.source.kind === 'keep' ? sequence.includes(x.source.pageId) : x.source.kind === 'merge' && x.source.pageIds.some(id => sequence.includes(id)));
    if (!used) continue;
    const start = s.slides.findIndex(x => x.source.kind === 'keep' && x.source.pageId === sequence[0]);
    if (start < 0 || !sequence.every((id, i) => { const x = s.slides[start + i]; return x?.source.kind === 'keep' && x.source.pageId === id; })) problems.push('元の連続は、すべてのページを順番どおり隣り合わせで残してください');
  }
  s.slides.forEach((slide, i) => {
    const n = i + 1;
    const ids = slide.source.kind === 'keep' ? [slide.source.pageId] : slide.source.kind === 'merge' ? slide.source.pageIds : [];
    for (const id of ids) if (!ctx.pageIds.includes(id)) problems.push(`${n}枚目: 存在しない pageId です（${id}）`);
    if (slide.source.kind !== 'keep' && !slide.note.trim()) problems.push(`${n}枚目: ${slide.source.kind === 'new' ? '新しく作る' : 'まとめる'}ページには note が必要です`);
  });
  if (!s.slides.some(x => x.source.kind !== 'new')) problems.push('元のページを1枚も使っていません。元の資料の内容を活かしてください');
  return problems;
}
