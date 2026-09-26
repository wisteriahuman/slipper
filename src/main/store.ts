// Local records: the brief and color meanings per presentation, requests, variants and adoptions.
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import type {SlideElement, Variant, VariantInput} from '@shared/element';
import type {ColorMeaning} from '@shared/palette';
import type {PageContent} from './google/convert';
import type {Storyline, StorylineInput} from '@shared/storyline';
import type {DeckReading, DeckReadingInput, PageReading, PageReadingInput} from '@shared/reading';

// audience = who listens to the presentation. subject = who or what the content is about (e.g. a
// product's users). They often differ: a hackathon pitch about a student app is heard by judges.
export type Brief = {audience: string; message: string; context?: string; subject?: string};
export type RequestSource = 'button' | 'conversation';
export type AdoptionCounts = {moved: number; textChanged: number; resized: number};
// Requests about the whole deck (storylines) use this page id.
export const DECK = '__deck__';
export type DeckSnapshot = {pageIds: string[]; sequences?: string[][]};
export type FlowRole = {role: string; note: string; position: number; total: number};

export class Store {
  private db: DatabaseSync;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`
      pragma journal_mode = wal;
      pragma foreign_keys = on;
      create table if not exists presentations (id text primary key, title text not null default '', audience text not null, message text not null, created_at integer not null, updated_at integer not null);
      create table if not exists color_meanings (id text primary key, presentation_id text not null references presentations(id), color_ref text not null, meaning text not null, updated_at integer not null, unique (presentation_id, color_ref));
      create table if not exists requests (id text primary key, presentation_id text not null references presentations(id), page_id text not null, source text not null, direction text, approach text, model text, effort text, status text not null, error text, page_snapshot text not null, started_at integer not null, finished_at integer);
      create table if not exists variants (id text primary key, request_id text not null references requests(id), aim text not null, gave_up text not null, elements text not null, received_at integer not null);
      create table if not exists adoptions (id text primary key, variant_id text not null references variants(id), final_elements text not null, aim_final text not null, moved_count integer not null, text_changed_count integer not null, resized_count integer not null, inserted_page_id text, adopted_at integer not null);
      create index if not exists requests_by_page on requests (presentation_id, page_id);
      create table if not exists storylines (id text primary key, request_id text not null references requests(id), aim text not null, gave_up text not null, slides text not null, received_at integer not null);
      create table if not exists storyline_adoptions (id text primary key, storyline_id text not null references storylines(id), new_presentation_id text not null, adopted_at integer not null);
      create table if not exists flow_roles (presentation_id text not null, page_id text not null, role text not null, note text not null, position integer not null, total integer not null, primary key (presentation_id, page_id));
      create table if not exists deck_readings (id text primary key, request_id text not null references requests(id), aim text not null, gave_up text not null, relation text not null, sections text not null, page_ids text not null, received_at integer not null);
      create table if not exists page_readings (presentation_id text not null, page_id text not null, content_key text not null, aim text not null, gave_up text not null, received_at integer not null, primary key (presentation_id, page_id));
    `);
    // Columns added after the first release.
    const columns = (this.db.prepare('pragma table_info(storylines)').all() as {name: string}[]).map(c => c.name);
    if (!columns.includes('from_current')) this.db.exec('alter table storylines add column from_current text');
    if (!columns.includes('supporting')) this.db.exec('alter table storylines add column supporting text');
    if (!columns.includes('technique')) this.db.exec('alter table storylines add column technique text');
    const variantColumns = (this.db.prepare('pragma table_info(variants)').all() as {name: string}[]).map(c => c.name);
    if (!variantColumns.includes('frames')) this.db.exec('alter table variants add column frames text');
    if (!variantColumns.includes('review')) this.db.exec('alter table variants add column review text');
    if (!variantColumns.includes('supporting')) this.db.exec('alter table variants add column supporting text');
    if (!variantColumns.includes('device')) this.db.exec('alter table variants add column device text');
    const deckColumns = (this.db.prepare('pragma table_info(presentations)').all() as {name: string}[]).map(c => c.name);
    if (!deckColumns.includes('context')) this.db.exec("alter table presentations add column context text not null default ''");
    if (!deckColumns.includes('subject')) this.db.exec("alter table presentations add column subject text not null default ''");
  }

  getBrief(presentationId: string): Brief | null {
    const row = this.db.prepare('select audience, message, context, subject from presentations where id = ?').get(presentationId) as Required<Brief> | undefined;
    return row ? {audience: row.audience, message: row.message, ...(row.context ? {context: row.context} : {}), ...(row.subject ? {subject: row.subject} : {})} : null;
  }

  saveBrief(presentationId: string, title: string, brief: Brief) {
    const now = Date.now();
    this.db.prepare(`insert into presentations (id, title, audience, message, context, subject, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)
      on conflict (id) do update set title = excluded.title, audience = excluded.audience, message = excluded.message, context = excluded.context, subject = excluded.subject, updated_at = excluded.updated_at`)
      .run(presentationId, title, brief.audience, brief.message, brief.context ?? '', brief.subject ?? '', now, now);
  }

  getColorMeanings(presentationId: string): ColorMeaning[] {
    return this.db.prepare('select color_ref as ref, meaning from color_meanings where presentation_id = ? order by color_ref').all(presentationId) as ColorMeaning[];
  }

  // Replaces the whole set; an empty meaning removes the color.
  setColorMeanings(presentationId: string, meanings: ColorMeaning[]) {
    this.db.prepare('delete from color_meanings where presentation_id = ?').run(presentationId);
    const insert = this.db.prepare('insert into color_meanings (id, presentation_id, color_ref, meaning, updated_at) values (?, ?, ?, ?, ?)');
    for (const m of meanings) if (m.meaning.trim()) insert.run(randomUUID(), presentationId, m.ref, m.meaning.trim(), Date.now());
  }

  createRequest(r: {presentationId: string; pageId: string; source: RequestSource; direction?: string; approach?: string; model?: string; effort?: string; snapshot: PageContent | DeckSnapshot}): string {
    const id = randomUUID();
    this.db.prepare('insert into requests (id, presentation_id, page_id, source, direction, approach, model, effort, status, page_snapshot, started_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, r.presentationId, r.pageId, r.source, r.direction ?? null, r.approach ?? null, r.model ?? null, r.effort ?? null, 'pending', JSON.stringify(r.snapshot), Date.now());
    return id;
  }

  setRequestModel(id: string, model: string) {
    this.db.prepare('update requests set model = ? where id = ?').run(model, id);
  }

  finishRequest(id: string, status: 'done' | 'failed', error?: string) {
    this.db.prepare('update requests set status = ?, error = ?, finished_at = ? where id = ?').run(status, error ?? null, Date.now(), id);
  }

  getRequest(id: string) {
    const row = this.db.prepare('select id, presentation_id as presentationId, page_id as pageId, approach, status, page_snapshot as snapshot from requests where id = ?').get(id) as
      {id: string; presentationId: string; pageId: string; approach: string | null; status: string; snapshot: string} | undefined;
    return row && {...row, snapshot: JSON.parse(row.snapshot) as PageContent & DeckSnapshot};
  }

  // elements keeps the first slide for rows written before variants became sequences.
  addVariant(v: VariantInput, review: Pick<Variant, 'plan' | 'visualReview' | 'independentReview'> = {}): Variant {
    const id = randomUUID(), receivedAt = Date.now();
    this.db.prepare('insert into variants (id, request_id, aim, gave_up, elements, frames, device, supporting, review, received_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, v.requestId, v.aim, v.gaveUp, JSON.stringify(v.frames[0]!.elements), JSON.stringify(v.frames), v.technique, JSON.stringify(v.supportingTechniques ?? []), JSON.stringify(review), receivedAt);
    return {...v, ...review, id, approach: this.getRequest(v.requestId)?.approach ?? null, receivedAt};
  }

  // Newest first, so earlier variants stay visible below new ones.
  listVariants(presentationId: string, pageId: string): Variant[] {
    type Row = {id: string; requestId: string; aim: string; gaveUp: string; elements: string; frames: string | null; device: string | null; supporting: string | null; review: string | null; receivedAt: number; approach: string | null};
    const rows = this.db.prepare(`select v.id, v.request_id as requestId, v.aim, v.gave_up as gaveUp, v.elements, v.frames, v.device, v.supporting, v.review, v.received_at as receivedAt, r.approach
      from variants v join requests r on r.id = v.request_id where r.presentation_id = ? and r.page_id = ? order by v.received_at desc, v.rowid desc`).all(presentationId, pageId) as unknown as Row[];
    // The device column holds the technique id.
    return rows.map(({elements, frames, device, supporting, review, ...r}) => ({...r, ...(review ? JSON.parse(review) as Pick<Variant, 'plan' | 'visualReview' | 'independentReview'> : {}), ...(supporting ? {supportingTechniques: JSON.parse(supporting) as string[]} : {}), ...(device ? {technique: device} : {}),
      frames: frames ? JSON.parse(frames) as Variant['frames'] : [{elements: JSON.parse(elements) as SlideElement[]}]}));
  }

  // Failed requests don't count: an approach that produced nothing hasn't really been tried.
  approachesUsed(presentationId: string, pageId: string): string[] {
    return (this.db.prepare("select distinct approach from requests where presentation_id = ? and page_id = ? and approach is not null and status != 'failed'").all(presentationId, pageId) as {approach: string}[]).map(r => r.approach);
  }

  // Techniques actually used on a page (or the deck), including those the AI chose itself.
  techniquesUsed(presentationId: string, pageId: string): string[] {
    const table = pageId === DECK ? 'storylines' : 'variants';
    const column = pageId === DECK ? 'technique' : 'device';
    const chosen = (this.db.prepare(`select distinct t.${column} as id from ${table} t join requests r on r.id = t.request_id where r.presentation_id = ? and r.page_id = ? and t.${column} is not null`).all(presentationId, pageId) as {id: string}[]).map(r => r.id);
    return [...new Set([...this.approachesUsed(presentationId, pageId), ...chosen])];
  }

  // final_elements holds the adopted slides (one array of elements per slide); inserted_page_id the first added page.
  addAdoption(a: {variantId: string; finalFrames: SlideElement[][]; aimFinal: string; counts: AdoptionCounts; insertedPageIds: string[]}): string {
    const id = randomUUID();
    this.db.prepare('insert into adoptions (id, variant_id, final_elements, aim_final, moved_count, text_changed_count, resized_count, inserted_page_id, adopted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, a.variantId, JSON.stringify(a.finalFrames), a.aimFinal, a.counts.moved, a.counts.textChanged, a.counts.resized, a.insertedPageIds.join(',') || null, Date.now());
    return id;
  }

  addStoryline(s: StorylineInput): Storyline {
    const id = randomUUID(), receivedAt = Date.now();
    this.db.prepare('insert into storylines (id, request_id, aim, gave_up, from_current, technique, supporting, slides, received_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, s.requestId, s.aim, s.gaveUp, s.fromCurrent, s.technique, JSON.stringify(s.supportingTechniques ?? []), JSON.stringify(s.slides), receivedAt);
    return {...s, id, approach: this.getRequest(s.requestId)?.approach ?? null, receivedAt};
  }

  listStorylines(presentationId: string): Storyline[] {
    const rows = this.db.prepare(`select s.id, s.request_id as requestId, s.aim, s.gave_up as gaveUp, s.from_current as fromCurrent, s.technique, s.supporting, s.slides, s.received_at as receivedAt, r.approach
      from storylines s join requests r on r.id = s.request_id where r.presentation_id = ? order by s.received_at desc, s.rowid desc`).all(presentationId) as unknown as
      Array<Omit<Storyline, 'slides'> & {slides: string; supporting: string | null}>;
    return rows.map(({supporting, ...r}) => ({...r, supportingTechniques: supporting ? JSON.parse(supporting) as string[] : undefined, fromCurrent: r.fromCurrent ?? undefined, technique: r.technique ?? undefined, slides: JSON.parse(r.slides) as Storyline['slides']}));
  }

  getStoryline(id: string): (Storyline & {presentationId: string}) | undefined {
    const row = this.db.prepare(`select s.id, s.request_id as requestId, s.aim, s.gave_up as gaveUp, s.from_current as fromCurrent, s.technique, s.supporting, s.slides, s.received_at as receivedAt, r.approach, r.presentation_id as presentationId
      from storylines s join requests r on r.id = s.request_id where s.id = ?`).get(id) as (Omit<Storyline, 'slides'> & {slides: string; supporting: string | null; presentationId: string}) | undefined;
    if (!row) return undefined;
    const {supporting, ...rest} = row;
    return {...rest, supportingTechniques: supporting ? JSON.parse(supporting) as string[] : undefined, slides: JSON.parse(row.slides) as Storyline['slides']};
  }

  // Records the new deck and each page's place in the flow, so page-level requests can use it.
  addStorylineAdoption(storylineId: string, newPresentationId: string, pages: Array<{pageId: string; role: string; note: string}>) {
    this.db.prepare('insert into storyline_adoptions (id, storyline_id, new_presentation_id, adopted_at) values (?, ?, ?, ?)').run(randomUUID(), storylineId, newPresentationId, Date.now());
    const insert = this.db.prepare('insert or replace into flow_roles (presentation_id, page_id, role, note, position, total) values (?, ?, ?, ?, ?, ?)');
    pages.forEach((p, i) => insert.run(newPresentationId, p.pageId, p.role, p.note, i + 1, pages.length));
  }

  flowRole(presentationId: string, pageId: string): FlowRole | null {
    return (this.db.prepare('select role, note, position, total from flow_roles where presentation_id = ? and page_id = ?').get(presentationId, pageId) as FlowRole | undefined) ?? null;
  }

  addDeckReading(r: DeckReadingInput, pageIds: string[]): DeckReading {
    const id = randomUUID(), receivedAt = Date.now();
    this.db.prepare('insert into deck_readings (id, request_id, aim, gave_up, relation, sections, page_ids, received_at) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, r.requestId, r.aim, r.gaveUp, r.relation, JSON.stringify(r.sections), JSON.stringify(pageIds), receivedAt);
    return {...r, id, pageIds, receivedAt};
  }

  // The latest reading of a deck; callers compare pageIds to know whether it is out of date.
  latestDeckReading(presentationId: string): DeckReading | null {
    const row = this.db.prepare(`select d.id, d.request_id as requestId, d.aim, d.gave_up as gaveUp, d.relation, d.sections, d.page_ids as pageIds, d.received_at as receivedAt
      from deck_readings d join requests r on r.id = d.request_id where r.presentation_id = ? order by d.received_at desc, d.rowid desc limit 1`).get(presentationId) as
      (Omit<DeckReading, 'sections' | 'pageIds'> & {sections: string; pageIds: string}) | undefined;
    return row ? {...row, sections: JSON.parse(row.sections), pageIds: JSON.parse(row.pageIds)} : null;
  }

  savePageReading(presentationId: string, pageId: string, contentKey: string, r: PageReadingInput): PageReading {
    const receivedAt = Date.now();
    this.db.prepare(`insert into page_readings (presentation_id, page_id, content_key, aim, gave_up, received_at) values (?, ?, ?, ?, ?, ?)
      on conflict (presentation_id, page_id) do update set content_key = excluded.content_key, aim = excluded.aim, gave_up = excluded.gave_up, received_at = excluded.received_at`)
      .run(presentationId, pageId, contentKey, r.aim, r.gaveUp, receivedAt);
    return {...r, receivedAt};
  }

  // Returns the reading only if it was made for the page's current content.
  pageReading(presentationId: string, pageId: string, contentKey: string): PageReading | null {
    const row = this.db.prepare('select aim, gave_up as gaveUp, received_at as receivedAt, content_key as contentKey from page_readings where presentation_id = ? and page_id = ?').get(presentationId, pageId) as
      (PageReading & {contentKey: string}) | undefined;
    if (!row || row.contentKey !== contentKey) return null;
    return {requestId: '', aim: row.aim, gaveUp: row.gaveUp, receivedAt: row.receivedAt};
  }

  close() { this.db.close(); }
}
