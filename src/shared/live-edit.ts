import {z} from 'zod';

export const BoxSchema = z.object({x: z.number().finite().min(-1920).max(3840), y: z.number().finite().min(-1920).max(3840), w: z.number().finite().min(1).max(3840), h: z.number().finite().min(1).max(3840)}).strict();
export type EditBox = z.infer<typeof BoxSchema>;
export const ElementPatchSchema = z.object({id: z.string().min(1), text: z.string().max(20000).optional(), box: BoxSchema.optional()}).strict();
export type ElementPatch = z.infer<typeof ElementPatchSchema>;
export const ApplyLiveEditSchema = z.object({snapshotId: z.string().min(1), patches: z.array(ElementPatchSchema).min(1).max(100)}).strict();
export type ApplyLiveEdit = z.infer<typeof ApplyLiveEditSchema>;
export type LiveElement = {id: string; label: string; kind: string; box: EditBox; text?: string; movable: boolean; resizable: boolean};
export type LivePage = {
  snapshotId: string; presentationId: string; pageId: string; version: string;
  width: number; height: number; elements: LiveElement[]; image: string | null; fetchedAt: number;
};
export type EditConflict = {id: string; label: string; field: 'text' | 'box' | 'deleted'; before: string; current: string; proposed: string};
export type ApplyLiveResult = {ok: boolean; message: string; page?: LivePage; conflicts?: EditConflict[]; undoId?: string};
export type LiveDraft = {base: LivePage; patches: ElementPatch[]};

export const sameBox = (a: EditBox, b: EditBox) => (['x', 'y', 'w', 'h'] as const).every(k => Math.abs(a[k] - b[k]) < 0.01);
export function cleanPatches(page: LivePage, patches: ElementPatch[]): ElementPatch[] {
  return patches.flatMap(p => {
    const original = page.elements.find(e => e.id === p.id);
    if (!original) return [p]; // Deleted remotely: preserve the draft for the conflict view.
    const next: ElementPatch = {id: p.id};
    if (p.text !== undefined && p.text !== original.text) next.text = p.text;
    if (p.box && !sameBox(p.box, original.box)) next.box = p.box;
    return next.text !== undefined || next.box ? [next] : [];
  });
}
// Explicitly resolving one conflict must not rebase other, unresolved edits.
export function resolveConflicts(latest: LivePage, patches: ElementPatch[], choices: Record<string, 'mine' | 'theirs'>): ElementPatch[] {
  return cleanPatches(latest, patches.flatMap(p => {
    if (!latest.elements.some(e => e.id === p.id)) return [];
    const next = {...p};
    if (choices[`${p.id}:text`] === 'theirs') delete next.text;
    if (choices[`${p.id}:box`] === 'theirs') delete next.box;
    return [next];
  }));
}
export type Arrangement = 'left' | 'top' | 'horizontal' | 'vertical';
export function arrangeElements(elements: LiveElement[], patches: ElementPatch[], ids: string[], arrangement: Arrangement): ElementPatch[] {
  const selected = elements.filter(e => ids.includes(e.id) && e.movable).map(e => ({...e, box: patches.find(p => p.id === e.id)?.box ?? e.box}));
  if (selected.length < 2) return patches;
  const boxes = new Map<string, EditBox>();
  if (arrangement === 'left' || arrangement === 'top') {
    const axis = arrangement === 'left' ? 'x' : 'y';
    const min = Math.min(...selected.map(e => e.box[axis]));
    selected.forEach(e => boxes.set(e.id, {...e.box, [axis]: min}));
  } else {
    const axis = arrangement === 'horizontal' ? 'x' : 'y', dim = axis === 'x' ? 'w' : 'h';
    selected.sort((a, b) => a.box[axis] - b.box[axis]);
    const first = selected[0]!, last = selected.at(-1)!;
    const gap = (last.box[axis] + last.box[dim] - first.box[axis] - selected.reduce((n, e) => n + e.box[dim], 0)) / (selected.length - 1);
    let pos = first.box[axis];
    selected.forEach(e => { boxes.set(e.id, {...e.box, [axis]: pos}); pos += e.box[dim] + gap; });
  }
  const next = new Map(patches.map(p => [p.id, p]));
  for (const [id, box] of boxes) next.set(id, {...next.get(id), id, box});
  return [...next.values()];
}
