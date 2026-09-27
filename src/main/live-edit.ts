import {createHash, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {ApplyLiveEditSchema, sameBox, type ApplyLiveEdit, type ApplyLiveResult, type EditBox, type EditConflict, type ElementPatch, type LivePage} from '@shared/live-edit';
import {fromEmu, toEmu, type PageSize} from '@shared/geometry';
import {box, type ApiPage, type ApiPageElement} from './google/convert';
import type {SlidesClient} from './google/slides-client';

type Source = {page: ApiPage; size: PageSize; revisionId: string};
type Snapshot = Source & {view: LivePage};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const textOf = (e: ApiPageElement) => (e.shape?.text?.textElements ?? []).map(t => t.textRun?.content ?? '').join('').replace(/\n$/, '');
const matrix = (e: ApiPageElement) => {
  const t = e.transform, unit = t?.unit === 'PT' ? 12700 : 1;
  return {scaleX: t ? t.scaleX ?? 0 : 1, scaleY: t ? t.scaleY ?? 0 : 1, shearX: t?.shearX ?? 0, shearY: t?.shearY ?? 0, translateX: (t?.translateX ?? 0) * unit, translateY: (t?.translateY ?? 0) * unit, unit: 'EMU' as const};
};
const geometryKey = (e: ApiPageElement, size: PageSize) => hash({box: box(e, size), matrix: matrix(e), size: e.size, group: e.elementGroup});
const boxLabel = (b: EditBox) => `位置 ${Math.round(b.x)}, ${Math.round(b.y)} ／ 大きさ ${Math.round(b.w)} × ${Math.round(b.h)}`;

export function liveElements(page: ApiPage, size: PageSize): LivePage['elements'] {
  return (page.pageElements ?? []).map(e => {
    const b = box(e, size);
    const kind = e.shape ? '文字・図形' : e.image ? '画像' : e.sheetsChart ? 'グラフ' : e.table ? '表' : e.elementGroup ? 'グループ' : e.line ? '線' : '要素';
    // Groups/tables and inherited placeholder geometry need separate editing contracts.
    const movable = !!e.size && !!e.transform && !e.elementGroup && !e.table && !e.shape?.placeholder && b.w >= 1 && b.h >= 1 && Object.values(b).every(Number.isFinite);
    const editableText = !!e.shape && !(e.shape.text?.textElements ?? []).some(t => 'autoText' in t);
    const text = editableText ? textOf(e) : undefined;
    return {id: e.objectId, kind, label: text?.trim().slice(0, 65) || e.title || e.description || kind, box: b, ...(text !== undefined ? {text} : {}), movable, resizable: movable && !e.line};
  });
}

// A minimal text range preserves formatting outside the changed substring. API indices use UTF-16.
export function textRequests(objectId: string, before: string, after: string): object[] {
  if (before === after) return [];
  const oldChars = Array.from(before), newChars = Array.from(after);
  let start = 0, end = 0;
  while (start < oldChars.length && start < newChars.length && oldChars[start] === newChars[start]) start++;
  while (end < oldChars.length - start && end < newChars.length - start && oldChars[oldChars.length - 1 - end] === newChars[newChars.length - 1 - end]) end++;
  const startIndex = oldChars.slice(0, start).join('').length;
  const endIndex = before.length - oldChars.slice(oldChars.length - end).join('').length;
  const text = newChars.slice(start, newChars.length - end).join('');
  return [...(endIndex > startIndex ? [{deleteText: {objectId, textRange: {type: 'FIXED_RANGE', startIndex, endIndex}}}] : []), ...(text ? [{insertText: {objectId, insertionIndex: startIndex, text}}] : [])];
}

export function planLiveEdit(base: Source, current: Source, patches: ElementPatch[]) {
  if (base.size.width !== current.size.width || base.size.height !== current.size.height) throw new Error('ページのサイズが変更されています。下書きを控えてから最新のページを読み込み直してください');
  const requests: object[] = [], conflicts: EditConflict[] = [], inverse: ElementPatch[] = [];
  const expected = structuredClone(current);
  const baseElements = liveElements(base.page, base.size), currentElements = liveElements(current.page, current.size);
  if (new Set(patches.map(p => p.id)).size !== patches.length) throw new Error('同じ要素の変更が重複しています');
  for (const p of patches) {
    const original = base.page.pageElements?.find(e => e.objectId === p.id), latest = current.page.pageElements?.find(e => e.objectId === p.id);
    const b = baseElements.find(e => e.id === p.id), c = currentElements.find(e => e.id === p.id);
    if (!original || !b) throw new Error('編集開始時に存在しなかった要素です');
    if (!latest || !c) {
      conflicts.push({id: p.id, label: b.label, field: 'deleted', before: b.text ?? boxLabel(b.box), current: 'Google Slides 側で削除されています', proposed: p.text ?? (p.box ? boxLabel(p.box) : '')});
      continue;
    }
    const undo: ElementPatch = {id: p.id};
    const after = expected.page.pageElements!.find(e => e.objectId === p.id)!;
    if (p.text !== undefined && p.text !== b.text) {
      if (b.text === undefined || c.text === undefined) throw new Error('この要素の文字は Google Slides 側で編集してください');
      if (c.text !== b.text && c.text !== p.text) conflicts.push({id: p.id, label: b.label, field: 'text', before: b.text, current: c.text, proposed: p.text});
      else if (c.text !== p.text) {
        requests.push(...textRequests(p.id, c.text, p.text)); undo.text = c.text;
        after.shape!.text = {textElements: [{textRun: {content: `${p.text}\n`}}]};
      }
    }
    if (p.box && !sameBox(p.box, b.box)) {
      if (!b.movable || !c.movable || (!c.resizable && (p.box.w !== c.box.w || p.box.h !== c.box.h))) throw new Error('この要素の配置は Google Slides 側で編集してください');
      if (sameBox(p.box, c.box)) { /* Already applied, including after a lost response. */ }
      else if (geometryKey(original, base.size) !== geometryKey(latest, current.size)) conflicts.push({id: p.id, label: b.label, field: 'box', before: boxLabel(b.box), current: boxLabel(c.box), proposed: boxLabel(p.box)});
      else {
        const sx = p.box.w / c.box.w, sy = p.box.h / c.box.h, m = matrix(latest);
        const transform = {...m, scaleX: m.scaleX * sx, shearX: m.shearX * sx, shearY: m.shearY * sy, scaleY: m.scaleY * sy,
          translateX: m.translateX * sx + toEmu(p.box.x - c.box.x * sx, current.size), translateY: m.translateY * sy + toEmu(p.box.y - c.box.y * sy, current.size)};
        requests.push({updatePageElementTransform: {objectId: p.id, applyMode: 'ABSOLUTE', transform}});
        after.transform = transform; undo.box = c.box;
      }
    }
    if (undo.text !== undefined || undo.box) inverse.push(undo);
  }
  return {requests, conflicts, inverse, expected};
}

export class LiveEditor {
  private snapshots = new Map<string, Snapshot>();
  private pinned = new Map<string, Snapshot>();
  private undos = new Map<string, ApplyLiveEdit>();
  private busy = new Set<string>();
  constructor(private slides: Pick<SlidesClient, 'editingPage' | 'thumbnail' | 'batchUpdate'>, private draftDir?: string) {}

  context(snapshotId: string) { return (this.snapshots.get(snapshotId) ?? this.pinned.get(snapshotId))?.view; }

  saveDraft(snapshotId: string, patches: ElementPatch[]) {
    const source = this.snapshots.get(snapshotId) ?? this.pinned.get(snapshotId);
    if (!source) throw new Error('下書きの元ページを保存できませんでした');
    if (patches.length) ApplyLiveEditSchema.parse({snapshotId, patches});
    const {presentationId, pageId} = source.view;
    for (const [id, snapshot] of this.pinned) if (snapshot.view.presentationId === presentationId && snapshot.view.pageId === pageId) this.pinned.delete(id);
    if (patches.length) this.pinned.set(snapshotId, source);
    if (!this.draftDir) return;
    const file = path.join(this.draftDir, `${hash({presentationId, pageId})}.json`);
    if (!patches.length) { fs.rmSync(file, {force: true}); return; }
    fs.mkdirSync(this.draftDir, {recursive: true, mode: 0o700});
    const temp = `${file}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({source: {...source, view: {...source.view, image: null}}, patches}), {mode: 0o600});
    fs.renameSync(temp, file);
  }

  loadDraft(presentationId: string, pageId: string) {
    if (!this.draftDir) return null;
    const file = path.join(this.draftDir, `${hash({presentationId, pageId})}.json`);
    if (!fs.existsSync(file)) return null;
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as {source: Snapshot; patches: ElementPatch[]};
    const input = ApplyLiveEditSchema.parse({snapshotId: saved.source.view.snapshotId, patches: saved.patches});
    if (saved.source.view.presentationId !== presentationId || saved.source.page.objectId !== pageId) throw new Error('保存した下書きのページが一致しません');
    const base = this.remember(presentationId, saved.source, null);
    this.pinned.set(base.snapshotId, this.snapshots.get(base.snapshotId)!);
    return {base, patches: input.patches};
  }

  private remember(presentationId: string, source: Source, image: string | null): LivePage {
    const version = hash({page: source.page, size: source.size});
    const snapshotId = hash({presentationId, pageId: source.page.objectId, version});
    const view: LivePage = {snapshotId, presentationId, pageId: source.page.objectId, version, width: 960, height: fromEmu(source.size.height, source.size), elements: liveElements(source.page, source.size), image, fetchedAt: Date.now()};
    this.snapshots.delete(snapshotId); this.snapshots.set(snapshotId, {...source, view});
    if (this.snapshots.size > 256) this.snapshots.delete(this.snapshots.keys().next().value!);
    return view;
  }

  async read(presentationId: string, pageId: string, knownVersion?: string): Promise<LivePage | null> {
    const source = await this.slides.editingPage(presentationId, pageId);
    const version = hash({page: source.page, size: source.size});
    if (knownVersion === version) return null;
    const image = await this.slides.thumbnail(presentationId, pageId).catch(() => null);
    return this.remember(presentationId, source, image);
  }

  async apply(input: ApplyLiveEdit): Promise<ApplyLiveResult> {
    const parsed = ApplyLiveEditSchema.safeParse(input);
    if (!parsed.success) return {ok: false, message: '変更内容が不正です。文字数・位置・大きさを確認してください'};
    const base = this.snapshots.get(parsed.data.snapshotId) ?? this.pinned.get(parsed.data.snapshotId);
    if (!base) return {ok: false, message: '編集開始時の情報が失われました。下書きを控えてから最新のページを読み込み直してください'};
    const {presentationId, pageId} = base.view;
    if (this.busy.has(presentationId)) return {ok: false, message: 'この資料への反映中です。完了を待ってください'};
    this.busy.add(presentationId);
    try {
      const current = await this.slides.editingPage(presentationId, pageId);
      const plan = planLiveEdit(base, current, parsed.data.patches);
      if (plan.conflicts.length) {
        const page = this.remember(presentationId, current, await this.slides.thumbnail(presentationId, pageId).catch(() => null));
        return {ok: false, message: '同じ箇所が Google Slides 側でも変更されています。残す内容を選んでください', conflicts: plan.conflicts, page};
      }
      if (!plan.requests.length) return {ok: true, message: 'この変更はすでに資料に反映されています', page: await this.read(presentationId, pageId) ?? undefined};
      // Never fall back to an unconditional write, including after a network failure.
      await this.slides.batchUpdate(presentationId, plan.requests, current.revisionId);
      const undoBase = this.remember(presentationId, plan.expected, null);
      const undoId = randomUUID();
      this.undos.set(undoId, {snapshotId: undoBase.snapshotId, patches: plan.inverse});
      if (this.undos.size > 30) this.undos.delete(this.undos.keys().next().value!);
      let page: LivePage | undefined;
      try { page = await this.read(presentationId, pageId) ?? undefined; } catch { /* The write succeeded; a thumbnail/read failure must not invite duplicate writes. */ }
      return {ok: true, message: page ? '同じページに反映しました。Google Slides 側でも続けて編集できます' : '反映しました。最新の表示は「最新を確認」で取得してください', page: page ?? undoBase, undoId};
    } catch (e) {
      return {ok: false, message: `反映を確認できませんでした。下書きは残っています。「最新を確認」で資料の状態を確認してください。${(e as Error).message}`};
    } finally { this.busy.delete(presentationId); }
  }

  async undo(id: string): Promise<ApplyLiveResult> {
    const input = this.undos.get(id);
    if (!input) return {ok: false, message: '取り消せる変更がありません'};
    const result = await this.apply(input);
    // An undo never silently overwrites subsequent changes by a collaborator.
    if (result.conflicts?.length) return {ok: false, message: '反映後に同じ箇所が編集されたため、取り消しませんでした。最新の内容を確認してください', page: result.page};
    if (result.ok) this.undos.delete(id);
    return {...result, message: result.ok ? '直前の変更を取り消しました' : result.message, undoId: undefined};
  }
}
