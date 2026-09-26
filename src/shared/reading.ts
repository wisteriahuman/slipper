import {z} from 'zod';

// A reading describes what the current deck or page does, in the same terms as a proposal
// (aim and what it gives up), so proposals can be compared against it. It describes the choices
// behind the current version; it does not score them.

export const DeckReadingInputShape = {
  requestId: z.string(),
  aim: z.string().min(4).max(100).describe('今の流れが聞き手に何をしようとしているか（1行）'),
  gaveUp: z.string().min(2).max(100).describe('今の流れが諦めている・後回しにしていること（1行）。欠点の指摘ではなく、選択の裏側として書く'),
  relation: z.string().min(4).max(160).describe('聞き手がこの流れから何を受け取り、何を判断できるか（1〜2行）。聞き手と題材の対象の違いそのものは指摘しない'),
  sections: z.array(z.object({
    role: z.string().min(2).max(60).describe('このまとまりが流れの中で果たしている役割'),
    pageIds: z.array(z.string()).min(1).describe('このまとまりに含まれるページ（資料の順番どおり）')
  })).min(1).max(12)
};
export const DeckReadingInputSchema = z.object(DeckReadingInputShape);
export type DeckReadingInput = z.infer<typeof DeckReadingInputSchema>;
export type DeckReading = DeckReadingInput & {id: string; pageIds: string[]; receivedAt: number};

export const PageReadingInputShape = {
  requestId: z.string(),
  aim: z.string().min(4).max(80).describe('今のこのページが聞き手に何をしようとしているか（1行）'),
  gaveUp: z.string().min(2).max(80).describe('今のこのページが諦めていること（1行）。欠点の指摘ではなく、選択の裏側として書く')
};
export const PageReadingInputSchema = z.object(PageReadingInputShape);
export type PageReadingInput = z.infer<typeof PageReadingInputSchema>;
export type PageReading = PageReadingInput & {receivedAt: number};

// Every page belongs to exactly one section, and sections follow the deck order.
export function validateDeckReading(r: DeckReadingInput, ctx: {pageIds: string[]}): string[] {
  const problems: string[] = [];
  const listed = r.sections.flatMap(s => s.pageIds);
  for (const id of listed) if (!ctx.pageIds.includes(id)) problems.push(`存在しない pageId です（${id}）`);
  const missing = ctx.pageIds.filter(id => !listed.includes(id));
  if (missing.length) problems.push(`どのまとまりにも入っていないページがあります: ${missing.join(', ')}`);
  if (new Set(listed).size !== listed.length) problems.push('同じページが複数のまとまりに入っています');
  const order = listed.map(id => ctx.pageIds.indexOf(id));
  if (order.some((v, i) => i > 0 && v < order[i - 1]!)) problems.push('まとまりとページは資料の順番どおりに並べてください');
  return problems;
}

// A cheap fingerprint of a page's content, to know when its reading is out of date.
export function contentKey(texts: string[], assetIds: string[]): string {
  return JSON.stringify([texts, assetIds]);
}
