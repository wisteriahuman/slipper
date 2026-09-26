// Ties the pieces together: follows the page shown in the editor, runs requests through Claude Code,
// receives variants over MCP, and writes an adopted variant back as a new page.
import {VariantReviewSchema, type VariantReview} from '@shared/variant-review';
import {PreviewReviews} from './preview-review';
import type {PreviewContext, PreviewResult, RenderVariant} from './variant-preview';
import {PLAN_PAGE, PLAN_FLOW, PlanInputSchema, validatePlan, type PlanInput, type ProposalPlan} from '@shared/proposal-plan';
import {randomBytes} from 'node:crypto';
import {VariantInputSchema, type VariantInput} from '@shared/element';
import type {PageSize} from '@shared/geometry';
import type {AdoptInput, PanelState} from '@shared/ipc';
import type {ColorMeaning} from '@shared/palette';
import {validateVariant} from '@shared/validate';
import {StorylineInputSchema, validateStoryline, type StorylineInput} from '@shared/storyline';
import {contentKey, DeckReadingInputSchema, PageReadingInputSchema, validateDeckReading, type DeckReading, type DeckReadingInput, type PageReadingInput} from '@shared/reading';
import {ClaudeRunner, DEFAULT_SETTINGS} from './claude-runner';
import {continuesPrevious, planSequence, toDecorations, toPageContent, toPalette, type ApiColorScheme, type ApiPage, type Decoration, type PageContent} from './google/convert';
import type {GoogleAuth} from './google/oauth';
import type {SlidesClient} from './google/slides-client';
import {buildVariantReviewPrompt, buildPlanPrompt, buildDeckReadingPrompt, buildPageReadingPrompt, buildStorylinePrompt, buildVariantPrompt, colorGuide, type DeckPage} from './prompt';
import {recipeFor} from '@shared/technique-recipes';
import {AI_CHOICE, techniqueById} from '@shared/techniques';
import type {DriveClient} from './google/drive-client';
import {mapByPosition, pickLayout, planNotes, planStructure} from './google/storyline-build';
import {DECK, type Brief, type Store} from './store';

type DeckInfo = {title: string; size: PageSize; colorScheme: ApiColorScheme | undefined; parents: Record<string, {layoutId?: string; masterId?: string}>};
type Result = {ok: boolean; message: string; newPageId?: string; newPresentationId?: string};
// Requests that read the current version rather than propose a new one are marked by approach.
const DECK_READING = '今の流れの読み解き';
const PAGE_READING = 'このページの読み解き';
const techniqueLabel = (id: string) => (id === AI_CHOICE ? 'AI が選ぶ手法' : techniqueById(id)?.name ?? id);
// The technique must come from the catalog at the right level, and match the one assigned (if any).
function techniqueProblems(id: string, assigned: string | null, level: 'page' | 'flow'): string[] {
  const t = techniqueById(id);
  if (!t || t.level !== level || !recipeFor(id).available) return [`technique: カタログにない手法です（${id}）`];
  if (assigned && assigned !== AI_CHOICE && assigned !== id) return [`technique: この依頼の手法は "${assigned}" です`];
  return [];
}
const pageKey = (c: PageContent) => contentKey(c.texts.map(t => t.text), c.assets.map(a => a.id));


export class Controller {
  private state: PanelState;
  private deckInfo = new Map<string, DeckInfo>();
  private pageContent: PageContent | null = null;
  private decorations: Decoration[] = [];
  // Theme colors of the master the current page uses; decks can have several masters.
  private pageScheme: ApiColorScheme | undefined;
  private parentPages = new Map<string, ApiPage>();
  // Page images shown to the AI, keyed by presentation/page/size. Fetched once per app session.
  private aiImages = new Map<string, string>();
  private runner: ClaudeRunner | null = null;
  private plans = new Map<string, ProposalPlan[]>();
  private assignedPlans = new Map<string, ProposalPlan>();
  private previewContexts = new Map<string, PreviewContext>();
  private reviews = new PreviewReviews();
  private renderedDrafts = new Map<string, PreviewResult['images']>();
  private reviewImages = new Map<string, PreviewResult['images']>();
  private seenReviewImages = new Set<string>();
  private reviewVerdicts = new Map<string, VariantReview>();
  private reviewAttempts = new Map<string, number>();
  private listeners = new Set<(s: PanelState) => void>();

  constructor(private deps: {store: Store; auth: GoogleAuth; slides: SlidesClient; drive: DriveClient; renderVariant: RenderVariant; browsers: PanelState['browsers']; openPresentation: (id: string) => void}) {
    this.state = {location: {presentationId: null, pageId: null}, signedIn: false, browsers: deps.browsers,
      google: this.googleState(),
      deck: null, page: null, pageError: null, variants: [], running: null, storylines: [], deckReading: null, thumbnails: {}, notices: [], mcp: null};
  }

  attachMcp(url: string, token: string) {
    this.runner = new ClaudeRunner(url, token);
    this.update({mcp: {url}});
  }

  getState = () => this.state;
  subscribe(listener: (s: PanelState) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private update(patch: Partial<PanelState>) { this.state = {...this.state, ...patch}; for (const l of this.listeners) l(this.state); }
  private notice(message: string) { this.update({notices: [...this.state.notices, message].slice(-5)}); }
  dismissNotice(i: number) { this.update({notices: this.state.notices.filter((_, k) => k !== i)}); }

  setSignedIn(signedIn: boolean) { if (signedIn !== this.state.signedIn) this.update({signedIn}); }
  private googleState() {
    const {auth} = this.deps;
    return {hasClient: auth.hasClient(), connected: auth.isConnected(), needsReconnect: auth.isConnected() && !auth.hasAllScopes()};
  }
  refreshGoogle() { this.update({google: this.googleState()}); void this.reloadPage(); }

  // Called whenever the editor URL changes.
  onLocation(presentationId: string | null, pageId: string | null) {
    const prev = this.state.location;
    if (prev.presentationId === presentationId && prev.pageId === pageId) return;
    this.update({location: {presentationId, pageId}});
    if (prev.presentationId !== presentationId) this.update({deck: null, storylines: [], deckReading: null, thumbnails: {}});
    void this.reloadPage();
  }

  private palette(presentationId: string) {
    return toPalette(this.pageScheme ?? this.deckInfo.get(presentationId)?.colorScheme, this.deps.store.getColorMeanings(presentationId));
  }

  // Refetches when the page is unknown, e.g. a page added after the deck was first read.
  private async deck(presentationId: string, pageId?: string): Promise<DeckInfo> {
    const cached = this.deckInfo.get(presentationId);
    if (cached && (!pageId || cached.parents[pageId])) return cached;
    const p = await this.deps.slides.presentation(presentationId);
    const info = {title: p.title, size: p.size, colorScheme: p.colorScheme, parents: p.parents};
    this.deckInfo.set(presentationId, info);
    return info;
  }

  private async reloadPage() {
    const {presentationId, pageId} = this.state.location;
    this.pageContent = null;
    this.pageScheme = undefined;
    this.update({page: null, pageError: null, variants: []});
    if (!presentationId) return;
    const brief = this.deps.store.getBrief(presentationId);
    if (!this.deps.auth.isConnected()) {
      this.update({deck: {presentationId, title: '', brief, palette: this.palette(presentationId)}});
      return;
    }
    try {
      const info = await this.deck(presentationId, pageId ?? undefined);
      if (this.state.location.presentationId !== presentationId) return;
      this.update({deck: {presentationId, title: info.title, brief, palette: this.palette(presentationId)}});
      if (!pageId) return;
      const parents = info.parents[pageId] ?? {};
      const [apiPage, thumbnailUrl, ...parentPages] = await Promise.all([
        this.deps.slides.page(presentationId, pageId),
        this.deps.slides.thumbnail(presentationId, pageId).catch(() => null),
        ...[parents.masterId, parents.layoutId].filter((id): id is string => !!id).map(id => this.parentPage(presentationId, id))
      ]);
      if (this.state.location.pageId !== pageId) return;
      const content = toPageContent(apiPage, info.size);
      this.pageContent = content;
      this.pageScheme = parentPages.find(p => p.pageProperties?.colorScheme?.colors?.length)?.pageProperties?.colorScheme;
      this.decorations = toDecorations(parentPages, info.size, this.palette(presentationId).hex);
      this.update({
        deck: {presentationId, title: info.title, brief, palette: this.palette(presentationId)},
        storylines: this.deps.store.listStorylines(presentationId),
        deckReading: this.deckReadingState(presentationId, Object.keys(info.parents)),
        page: {pageId, thumbnailUrl, decorations: this.decorations, assets: content.assets.map(({id, kind, description, contentUrl, x, y, w, h}) => ({id, kind, description, contentUrl, x, y, w, h})),
          textBoxes: content.texts.map(({x, y, w, h}) => ({x, y, w, h})),
          reading: this.deps.store.pageReading(presentationId, pageId, pageKey(content))},
        variants: this.deps.store.listVariants(presentationId, pageId)
      });
      this.refreshStoryboardImages();
    } catch (e) {
      this.update({pageError: (e as Error).message});
    }
  }

  // Layouts and masters rarely change while the app is open, so they are fetched once per id.
  private async parentPage(presentationId: string, id: string): Promise<ApiPage> {
    const key = `${presentationId}/${id}`;
    const cached = this.parentPages.get(key);
    if (cached) return cached;
    const page = await this.deps.slides.page(presentationId, id);
    this.parentPages.set(key, page);
    return page;
  }

  saveBrief(input: Brief & {colors: ColorMeaning[]}): Result {
    const id = this.state.location.presentationId;
    if (!id) return {ok: false, message: '資料を開いてください'};
    if (!input.audience.trim() || !input.message.trim()) return {ok: false, message: '「誰に」と「何を」は必須です'};
    this.deps.store.saveBrief(id, this.state.deck?.title ?? '', {audience: input.audience.trim(), message: input.message.trim(), context: input.context?.trim() || undefined, subject: input.subject?.trim() || undefined});
    this.deps.store.setColorMeanings(id, input.colors);
    this.update({deck: {presentationId: id, title: this.state.deck?.title ?? '', brief: this.deps.store.getBrief(id), palette: this.palette(id)}});
    return {ok: true, message: '保存しました'};
  }

  private ready(): {presentationId: string; pageId: string; content: PageContent; brief: Brief} {
    const {presentationId, pageId} = this.state.location;
    if (!presentationId || !pageId) throw new Error('左で資料のページを開いてください');
    if (!this.pageContent || this.pageContent.pageId !== pageId) throw new Error('ページの内容をまだ読み込めていません');
    const brief = this.deps.store.getBrief(presentationId);
    if (!brief) throw new Error('先に資料の「誰に・何を」を書いてください');
    return {presentationId, pageId, content: this.pageContent, brief};
  }

  async requestVariants(input: {direction: string; deep: boolean}): Promise<Result> {
    if (!this.runner) return {ok: false, message: 'MCP サーバーが起動していません'};
    if (this.state.running) return {ok: false, message: '前の依頼を処理中です'};
    this.update({running: {kind:'page',pending:3,startedAt:Date.now(),deep:input.deep,status:'ページを読み込んでいます'}});
    await this.reloadPage();
    let ctx;
    try { ctx = this.ready(); } catch (e) { this.update({running:null}); return {ok: false, message: (e as Error).message}; }
    const settings = {...DEFAULT_SETTINGS, effort: input.deep ? 'high' as const : 'medium' as const};
    const direction = input.direction.trim() || undefined;
    const previewContext: PreviewContext = {palette: this.palette(ctx.presentationId), assets: ctx.content.assets, decorations: structuredClone(this.decorations), pageImage: this.state.page?.thumbnailUrl ?? null, textBoxes: ctx.content.texts};
    const palette = this.palette(ctx.presentationId);
    this.update({running: {kind: 'page', pending: 3, startedAt: Date.now(), deep: input.deep, status: null}});
    const flowRole = this.deps.store.flowRole(ctx.presentationId, ctx.pageId);
    // Read the page as it is now alongside the proposals, so there is something to compare them with.
    if (!this.deps.store.pageReading(ctx.presentationId, ctx.pageId, pageKey(ctx.content))) {
      const requestId = this.deps.store.createRequest({presentationId: ctx.presentationId, pageId: ctx.pageId, source: 'button', approach: PAGE_READING, model: DEFAULT_SETTINGS.model, effort: 'medium', snapshot: ctx.content});
      void this.runner.run(buildPageReadingPrompt({requestId, brief: ctx.brief, page: ctx.content, flowRole}), {...DEFAULT_SETTINGS, effort: 'medium'}, 'submit_page_reading')
        .then(r => this.deps.store.finishRequest(requestId, r.ok ? 'done' : 'failed', r.error));
    }
    const runner = this.runner;
    try {
      const plans = await this.planProposals({presentationId: ctx.presentationId, pageId: ctx.pageId, brief: ctx.brief, snapshot: ctx.content, material: {...ctx.content, flowRole}, direction, deep: input.deep});
      await Promise.all(plans.map(async plan => {
        const approach = plan.technique;
        const requestId = this.deps.store.createRequest({presentationId: ctx.presentationId, pageId: ctx.pageId, source: 'button', direction, approach, model: settings.model, effort: settings.effort, snapshot: ctx.content});
        this.assignedPlans.set(requestId, plan);
        this.previewContexts.set(requestId, previewContext);
        const result = await runner.run(buildVariantPrompt({requestId, brief: ctx.brief, palette, page: ctx.content, decorations: previewContext.decorations, flowRole, technique: approach, plan, direction}), settings, 'submit_variant', p => {
          if (this.state.running) this.update({running: {...this.state.running, status: `AI 側が混雑しています（再試行 ${p.attempt}/${p.maxRetries}）。混み続ける場合は別のモデルに切り替えます`}});
        });
        if (result.models.some(m => m.includes(settings.fallbackModel))) this.update({running: this.state.running && {...this.state.running, status: '混雑のため、別のモデルで考えています'}});
        this.deps.store.setRequestModel(requestId, result.models.join(',') || settings.model);
        const delivered = this.deps.store.listVariants(ctx.presentationId, ctx.pageId).some(v => v.requestId === requestId);
        const error = result.ok ? (delivered ? undefined : '案が届きませんでした') : result.error;
        this.deps.store.finishRequest(requestId, error ? 'failed' : 'done', error);
        this.assignedPlans.delete(requestId); this.previewContexts.delete(requestId); this.reviews.clear(requestId); this.renderedDrafts.delete(requestId); this.reviewAttempts.delete(requestId); this.clearRequestImages(requestId);
        if (error) this.notice(`「${techniqueLabel(approach)}」の案: ${error}`);
        this.update({running: this.state.running && {...this.state.running, pending: this.state.running.pending - 1}});
      }));
      return {ok: true, message: '依頼が終わりました'};
    } catch (e) { return {ok: false, message: (e as Error).message}; }
    finally { this.update({running: null}); }
  }

  private async planProposals(o: {presentationId: string; pageId: string; brief: Brief; snapshot: PageContent | import('./store').DeckSnapshot; material: unknown; direction?: string; deep: boolean}): Promise<ProposalPlan[]> {
    const level = o.pageId === DECK ? 'flow' : 'page';
    this.setRunningStatus('内容に合う、狙いの異なる3案を考えています');
    const requestId = this.deps.store.createRequest({...o, source: 'button', approach: level === 'page' ? PLAN_PAGE : PLAN_FLOW});
    const result = await this.runner!.run(buildPlanPrompt({requestId, level, brief: o.brief, material: o.material, used: this.deps.store.techniquesUsed(o.presentationId, o.pageId), direction: o.direction}), {...DEFAULT_SETTINGS, effort: o.deep ? 'high' : 'medium'}, 'submit_proposal_plan');
    const plans = this.plans.get(requestId);
    this.plans.delete(requestId); this.clearRequestImages(requestId);
    this.deps.store.finishRequest(requestId, result.ok && plans ? 'done' : 'failed', result.error);
    if (!result.ok || !plans) throw new Error(result.error ?? '狙いの案が届きませんでした');
    this.setRunningStatus('選んだ狙いをスライドにしています');
    return plans;
  }

  async submitProposalPlan(input: PlanInput): Promise<string[]> {
    const parsed = PlanInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => i.message);
    const request = this.deps.store.getRequest(input.requestId);
    if (!request || request.status !== 'pending' || ![PLAN_PAGE, PLAN_FLOW].includes(request.approach ?? '')) return ['狙いを考える依頼が見つかりません'];
    const level = request.approach === PLAN_PAGE ? 'page' : 'flow';
    const sourceIds = level === 'flow' ? request.snapshot.pageIds : [request.pageId, ...request.snapshot.texts.map(x => x.id), ...request.snapshot.assets.map(x => x.id)];
    const problems = validatePlan(parsed.data, level, sourceIds);
    if (!problems.length) this.plans.set(input.requestId, parsed.data.proposals);
    return problems;
  }

  private clearRequestImages(id: string) { for (const key of this.aiImages.keys()) if (key.startsWith(`${id}/`)) this.aiImages.delete(key); }

  cancelRequests() { this.runner?.cancelAll(); }

  // MCP: for a conversation in the user's own Claude Code.
  async currentPageForConversation(direction: string | undefined) {
    const ctx = this.ready();
    const requestId = this.deps.store.createRequest({presentationId: ctx.presentationId, pageId: ctx.pageId, source: 'conversation', direction, snapshot: ctx.content});
    const palette = this.palette(ctx.presentationId);
    this.previewContexts.set(requestId, {palette, assets: ctx.content.assets, decorations: structuredClone(this.decorations), pageImage: this.state.page?.thumbnailUrl ?? null, textBoxes: ctx.content.texts});
    return {
      review: 'preview_variant で案を描画して見直し、同じ内容に previewToken と visualReview を添えて submit_variant する',
      requestId, canvas: {width: 960, height: 540}, brief: ctx.brief, fixedDecorations: this.decorations.map(({x, y, w, h, kind}) => ({x, y, w, h, kind})),
      colors: colorGuide(palette),
      page: {texts: ctx.content.texts.map(t => ({id: t.id, text: t.text})), assets: ctx.content.assets.map(a => ({assetId: a.id, kind: a.kind, description: a.description}))},
      existingAims: this.state.variants.map(v => v.aim)
    };
  }

  // MCP: validate against the page as it was when the request was made.
  private variantProblems(input: VariantInput): string[] {
    const parsed = VariantInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const request = this.deps.store.getRequest(input.requestId);
    if (!request) return ['不明な requestId です'];
    if (request.pageId === DECK) return ['これは資料全体の流れの依頼です。submit_storyline を使ってください'];
    if (request.approach === PLAN_PAGE || request.approach === PLAN_FLOW) return ['これは狙いを考える依頼です'];
    if (request.approach === PAGE_READING) return ['これはページの読み解きの依頼です。submit_page_reading を使ってください'];
    if (request.status !== 'pending') return ['この依頼はもう締め切られています'];
    const assetIds = request.snapshot.assets.map(a => a.id);
    const problems = [...techniqueProblems(parsed.data.technique, request.approach, 'page'), ...validateVariant(parsed.data, {assetIds, palette: this.previewContexts.get(input.requestId)?.palette ?? this.palette(request.presentationId)})];
    return problems;
  }

  async previewVariant(input: VariantInput): Promise<PreviewResult & {previewToken?: string}> {
    const parsed = VariantInputSchema.safeParse(input);
    if (!parsed.success) return {images: [], problems: parsed.error.issues.map(i => i.message)};
    const problems = this.variantProblems(parsed.data);
    this.reviews.clear(input.requestId);
    if (problems.length) return {images: [], problems};
    const context = this.previewContexts.get(input.requestId);
    if (!context) return {images: [], problems: ['描画する元のページを再取得して依頼してください']};
    if (input.frames.some(f => f.elements.some(e => e.type === 'asset')) && !context.pageImage) return {images: [], problems: ['元のページ画像がないため素材の見た目を確認できません。ページを再読み込みしてください']};
    const rendered = await this.deps.renderVariant(parsed.data, context);
    if (this.deps.store.getRequest(input.requestId)?.status !== 'pending') return {images: [], problems: ['依頼は終了しています']};
    this.renderedDrafts.set(input.requestId, rendered.images);
    return {...rendered, previewToken: this.reviews.record(parsed.data, rendered.problems)};
  }

  async submitVariant(input: VariantInput & {previewToken?: string; visualReview?: string}): Promise<string[]> {
    const parsed = VariantInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => i.message);
    const problems = this.variantProblems(parsed.data);
    if (problems.length) return problems;
    if (!this.reviews.accepts(parsed.data, input.previewToken)) return ['preview_variant でこの案を描画し、画像を見直してから、その previewToken を添えて送ってください'];
    if (!input.visualReview || input.visualReview.trim().length < 8) return ['visualReview に画像で確認した注目先・狙い・修正点を具体的に書いてください'];
    const request = this.deps.store.getRequest(input.requestId)!;
    const review = await this.reviewDraft(parsed.data);
    if (review.verdict === 'revise') return review.issues;
    if (this.deps.store.getRequest(input.requestId)?.status !== 'pending' || !this.reviews.accepts(parsed.data, input.previewToken)) return ['依頼が終了したか、別の案が描画されました'];
    const variant = this.deps.store.addVariant(parsed.data, {plan: this.assignedPlans.get(input.requestId), visualReview: input.visualReview, independentReview: review.evidence});
    this.reviews.clear(input.requestId);
    if (this.state.location.presentationId === request.presentationId && this.state.location.pageId === request.pageId)
      this.update({variants: [variant, ...this.state.variants]});
    return [];
  }

  async submitVariantReview(input: VariantReview): Promise<string[]> {
    const parsed = VariantReviewSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(x => x.message);
    const request = this.deps.store.getRequest(input.requestId);
    if (request?.status !== 'pending' || request.approach !== '__variant_review__' || !this.reviewImages.has(input.requestId)) return ['見直しの依頼が見つかりません'];
    if (!this.seenReviewImages.has(input.requestId)) return ['get_page_images で画像を見てから見直しを送ってください'];
    this.reviewVerdicts.set(input.requestId, parsed.data);
    return [];
  }

  private async reviewDraft(variant: VariantInput): Promise<VariantReview> {
    const fail = (message: string): VariantReview => ({requestId: variant.requestId, verdict:'revise', issues:[message], evidence:'確認を完了できませんでした'});
    const attempts = this.reviewAttempts.get(variant.requestId) ?? 0;
    if (attempts >= 3) return fail('見直しは3回までです。この案の生成を終了してください');
    this.reviewAttempts.set(variant.requestId, attempts + 1);
    const parent = this.deps.store.getRequest(variant.requestId)!;
    const context = this.previewContexts.get(variant.requestId)!;
    const images = this.renderedDrafts.get(variant.requestId);
    const brief = this.deps.store.getBrief(parent.presentationId);
    if (!this.runner || !images || !brief) return fail('見直しに必要な画像・資料情報がありません');
    const requestId = this.deps.store.createRequest({presentationId:parent.presentationId, pageId:parent.pageId, source:'button', approach:'__variant_review__', snapshot:parent.snapshot});
    const original = context.pageImage && /^data:([^;]+);base64,(.*)$/.exec(context.pageImage);
    this.reviewImages.set(requestId, [...(original ? [{label:'元のページ',mimeType:original[1]!,base64:original[2]!}] : []), ...images]);
    this.setRunningStatus('画像と根拠を別の視点で確認しています');
    try {
      const result = await this.runner.run(buildVariantReviewPrompt({requestId, brief, source:parent.snapshot, variant, plan:this.assignedPlans.get(variant.requestId)}), DEFAULT_SETTINGS, 'submit_variant_review', undefined, 90_000);
      const review = this.reviewVerdicts.get(requestId);
      this.deps.store.finishRequest(requestId, result.ok && review ? 'done' : 'failed', result.error);
      return result.ok && review ? review : fail(`見直しを完了できませんでした: ${result.error ?? '結果が届きませんでした'}。この案の生成を終了してください`);
    } finally { this.reviewImages.delete(requestId); this.reviewVerdicts.delete(requestId); this.seenReviewImages.delete(requestId); }
  }

  async adopt(input: AdoptInput): Promise<Result> {
    const {presentationId, pageId} = this.state.location;
    const variant = this.state.variants.find(v => v.id === input.variantId);
    if (!presentationId || !pageId || !variant) return {ok: false, message: '案が見つかりません'};
    try {
      const info = await this.deck(presentationId);
      // Plan against the page as it is now, so edits made by others since the request are kept.
      const page = await this.deps.slides.page(presentationId, pageId);
      const present = new Set((page.pageElements ?? []).map(e => e.objectId));
      const missing = new Set(input.frames.flat().filter(e => e.type === 'asset' && !present.has(e.assetId ?? '')).map(e => e.assetId));
      const plan = planSequence({page, size: info.size, frames: input.frames, idPrefix: `slp_${randomBytes(4).toString('hex')}`});
      await this.deps.slides.batchUpdate(presentationId, plan.requests);
      this.deps.store.addAdoption({variantId: variant.id, finalFrames: input.frames, aimFinal: input.aim, counts: input.counts, insertedPageIds: plan.newPageIds});
      // The editor is not moved automatically, so the panel stays on the original page and its variants.
      const where = input.frames.length > 1 ? `元のページの直後に ${input.frames.length} 枚続けて追加しました` : '元のページの直後に追加しました';
      return {ok: true, newPageId: plan.newPageIds[0], message: missing.size ? `${where}。元のページから消えていた素材 ${missing.size} 件は含めていません` : where};
    } catch (e) {
      return {ok: false, message: `追加できませんでした: ${(e as Error).message}`};
    }
  }

  // --- Storylines: alternative flows for the whole deck -------------------------------------

  async requestStorylines(input: {direction: string; deep: boolean}): Promise<Result> {
    if (!this.runner) return {ok: false, message: 'MCP サーバーが起動していません'};
    if (this.state.running) return {ok: false, message: '前の依頼を処理中です'};
    const presentationId = this.state.location.presentationId;
    if (!presentationId) return {ok: false, message: '左で資料を開いてください'};
    const brief = this.deps.store.getBrief(presentationId);
    if (!brief) return {ok: false, message: '先に資料の「誰に・何を」を書いてください'};
    this.update({running: {kind: 'flow', pending: 3, startedAt: Date.now(), deep: input.deep, status: '資料全体を読み込んでいます'}});
    try {
      const pages = await this.loadDeckPages(presentationId);
      const settings = {...DEFAULT_SETTINGS, effort: input.deep ? 'high' as const : 'medium' as const};
      const direction = input.direction.trim() || undefined;

      const runner = this.runner!;
      // Proposals are written against a reading of the current flow; make one first if needed.
      this.setRunningStatus('今の流れを読み解いています');
      const reading = await this.ensureDeckReading(presentationId, brief, pages, false);
      this.setRunningStatus(null);
      const sequences: string[][] = [];
      for (let i = 1; i < pages.length; i++) if (pages[i]!.continuesPrevious) {
        const last = sequences.at(-1);
        if (last?.at(-1) === pages[i - 1]!.pageId) last.push(pages[i]!.pageId);
        else sequences.push([pages[i - 1]!.pageId, pages[i]!.pageId]);
      }
      const snapshot = {pageIds: pages.map(p => p.pageId), sequences};
      const plans = await this.planProposals({presentationId, pageId: DECK, brief, snapshot, material: {pages, reading}, direction, deep: input.deep});
      await Promise.all(plans.map(async plan => {
        const approach = plan.technique;
        const requestId = this.deps.store.createRequest({presentationId, pageId: DECK, source: 'button', direction, approach, model: settings.model, effort: settings.effort, snapshot});
        this.assignedPlans.set(requestId, plan);
        const result = await runner.run(buildStorylinePrompt({requestId, brief, pages, reading, technique: approach, plan, direction}), settings, 'submit_storyline', p => {
          if (this.state.running) this.update({running: {...this.state.running, status: `AI 側が混雑しています（再試行 ${p.attempt}/${p.maxRetries}）`}});
        });
        const delivered = this.deps.store.listStorylines(presentationId).some(s => s.requestId === requestId);
        const error = result.ok ? (delivered ? undefined : '流れの案が届きませんでした') : result.error;
        this.deps.store.setRequestModel(requestId, result.models.join(',') || settings.model);
        this.deps.store.finishRequest(requestId, error ? 'failed' : 'done', error);
        this.assignedPlans.delete(requestId); this.clearRequestImages(requestId);
        if (error) this.notice(`「${techniqueLabel(approach)}」の流れ: ${error}`);
        this.update({running: this.state.running && {...this.state.running, pending: this.state.running.pending - 1}});
      }));
      return {ok: true, message: '依頼が終わりました'};
    } catch (e) {
      return {ok: false, message: (e as Error).message};
    } finally {
      this.update({running: null});
    }
  }

  async submitStoryline(input: StorylineInput): Promise<string[]> {
    const parsed = StorylineInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const request = this.deps.store.getRequest(input.requestId);
    if (!request || request.pageId !== DECK) return ['不明な requestId です'];
    if (request.status !== 'pending') return ['この依頼はもう締め切られています'];
    if (request.approach === PLAN_FLOW) return ['これは狙いを考える依頼です'];
    if (request.approach === DECK_READING) return ['これは今の流れの読み解きの依頼です。submit_deck_reading を使ってください'];
    const problems = [...techniqueProblems(parsed.data.technique, request.approach, 'flow'),
      ...validateStoryline(parsed.data, {pageIds: request.snapshot.pageIds ?? [], steps: techniqueById(parsed.data.technique)?.steps, sequences: request.snapshot.sequences})];
    if (problems.length) return problems;
    const storyline = this.deps.store.addStoryline(parsed.data);
    if (this.state.location.presentationId === request.presentationId) {
      this.update({storylines: [storyline, ...this.state.storylines]});
      void this.ensureThumbnails(request.presentationId, storyline.slides.flatMap(s => s.source.kind === 'keep' ? [s.source.pageId] : s.source.kind === 'merge' ? s.source.pageIds : []));
    }
    return [];
  }

  // Storyboards show kept pages as Google renders them, small and cached for the deck.
  private async ensureThumbnails(presentationId: string, pageIds: string[]) {
    const missing = [...new Set(pageIds)].filter(id => !this.state.thumbnails[id]);
    for (const id of missing) {
      const data = await this.deps.slides.thumbnail(presentationId, id, 'SMALL').catch(() => null);
      if (this.state.location.presentationId !== presentationId) return;
      if (data) this.update({thumbnails: {...this.state.thumbnails, [id]: data}});
    }
  }

  refreshStoryboardImages() {
    const id = this.state.location.presentationId;
    if (id) void this.ensureThumbnails(id, this.state.storylines.flatMap(s => s.slides.flatMap(x => x.source.kind === 'keep' ? [x.source.pageId] : x.source.kind === 'merge' ? x.source.pageIds : [])));
  }

  // Builds the storyline as a new deck: copy in Drive, then rearrange the copy. The original is untouched.
  async adoptStoryline(storylineId: string): Promise<Result> {
    if (!this.deps.auth.hasAllScopes()) return {ok: false, message: '流れの案から資料を作るには Drive の権限が必要です。「Google に接続し直す」を押してください'};
    const storyline = this.deps.store.getStoryline(storylineId);
    if (!storyline) return {ok: false, message: '流れの案が見つかりません'};
    try {
      const info = await this.deck(storyline.presentationId);
      const original = await this.deps.slides.structure(storyline.presentationId);
      const copyId = await this.deps.drive.copy(storyline.presentationId, `${info.title || '資料'}（流れの案: ${storyline.aim.slice(0, 24)}）`);
      const copy = await this.deps.slides.structure(copyId);
      const idMap = mapByPosition({originalIds: original.slides.map(s => s.id), copyIds: copy.slides.map(s => s.id)});
      const firstKept = storyline.slides.find(s => s.source.kind !== 'new');
      const keptCopyId = firstKept && idMap.get(firstKept.source.kind === 'keep' ? firstKept.source.pageId : firstKept.source.kind === 'merge' ? firstKept.source.pageIds[0]! : '');
      const layoutId = pickLayout(copy.layouts, copy.slides.find(s => s.id === keptCopyId)?.layoutId);
      const idPrefix = `slp_${randomBytes(4).toString('hex')}`;
      const plan = planStructure({storyline, idMap, layoutId, idPrefix});
      await this.deps.slides.batchUpdate(copyId, plan.requests);
      const built = await this.deps.slides.structure(copyId);
      const notesIds = new Map(built.slides.filter(s => s.notesId).map(s => [s.id, s.notesId!]));
      await this.deps.slides.batchUpdate(copyId, planNotes({storyline, order: plan.order, speakerNotesIds: notesIds, idPrefix}));
      this.deps.store.addStorylineAdoption(storyline.id, copyId, plan.order.map((pageId, i) => ({pageId, role: storyline.slides[i]!.role, note: storyline.slides[i]!.note})));
      return {ok: true, newPresentationId: copyId, message: `構成の下書きを作りました（${plan.order.length}枚）。新規・統合ページの中身は、各ページで仕上げてください`};
    } catch (e) {
      return {ok: false, message: `資料を作れませんでした: ${(e as Error).message}`};
    }
  }

  openPresentation(id: string) { this.deps.openPresentation(id); }

  // MCP: images for a request. One page at medium size, or every page of the deck at small size.
  async pageImages(requestId: string) {
    if (this.reviewImages.has(requestId)) { this.seenReviewImages.add(requestId); return this.reviewImages.get(requestId)!; }
    const request = this.deps.store.getRequest(requestId);
    if (!request) throw new Error('不明な requestId です');
    const deck = request.pageId === DECK;
    const pageIds = deck ? request.snapshot.pageIds ?? [] : [request.pageId];
    const size = deck ? 'SMALL' as const : 'MEDIUM' as const;
    const out: Array<{label: string; base64: string; mimeType: string}> = [];
    for (const [i, pageId] of pageIds.entries()) {
      const key = `${requestId}/${pageId}/${size}`;
      let data = this.aiImages.get(key);
      if (!data) {
        data = await this.deps.slides.thumbnail(request.presentationId, pageId, size).catch(() => undefined);
        if (data) this.aiImages.set(key, data);
      }
      const m = data && /^data:([^;]+);base64,(.*)$/.exec(data);
      if (m) out.push({label: deck ? `${i + 1}枚目（pageId: ${pageId}）` : `このページ（pageId: ${pageId}）`, mimeType: m[1]!, base64: m[2]!});
    }
    return out;
  }

  // --- Readings of the current deck and page -------------------------------------------------

  private setRunningStatus(status: string | null) {
    const running = this.getState().running;
    if (running) this.update({running: {...running, status}});
  }

  private deckReadingState(presentationId: string, currentPageIds: string[]) {
    const reading = this.deps.store.latestDeckReading(presentationId);
    return reading ? {reading, stale: JSON.stringify(reading.pageIds) !== JSON.stringify(currentPageIds)} : null;
  }

  private async loadDeckPages(presentationId: string): Promise<DeckPage[]> {
    const info = await this.deck(presentationId);
    const contents = (await this.deps.slides.allSlides(presentationId)).map(p => toPageContent(p, info.size));
    return contents.map((c, i) => ({
      pageId: c.pageId, texts: c.texts.map(t => t.text), assets: c.assets.map(a => `${a.kind}: ${a.description}`),
      ...(i > 0 && continuesPrevious(contents[i - 1]!, c) ? {continuesPrevious: true} : {})
    }));
  }

  // Reuses the latest reading while the deck's pages are unchanged; otherwise reads it again.
  private async ensureDeckReading(presentationId: string, brief: Brief, pages: DeckPage[], force: boolean): Promise<DeckReading | null> {
    const pageIds = pages.map(p => p.pageId);
    const current = this.deckReadingState(presentationId, pageIds);
    if (current && !current.stale && !force) return current.reading;
    if (!this.runner) return null;
    const requestId = this.deps.store.createRequest({presentationId, pageId: DECK, source: 'button', approach: DECK_READING, model: DEFAULT_SETTINGS.model, effort: 'medium', snapshot: {pageIds}});
    const result = await this.runner.run(buildDeckReadingPrompt({requestId, brief, pages}), {...DEFAULT_SETTINGS, effort: 'medium'}, 'submit_deck_reading');
    const reading = this.deps.store.latestDeckReading(presentationId);
    const delivered = reading?.requestId === requestId;
    this.deps.store.finishRequest(requestId, delivered ? 'done' : 'failed', delivered ? undefined : result.error ?? '読み解きが届きませんでした');
    if (!delivered) { this.notice(`今の流れを読み解けませんでした: ${result.error ?? '読み解きが届きませんでした'}`); return null; }
    return reading;
  }

  async rereadDeck(): Promise<Result> {
    const presentationId = this.state.location.presentationId;
    if (!presentationId) return {ok: false, message: '左で資料を開いてください'};
    const brief = this.deps.store.getBrief(presentationId);
    if (!brief) return {ok: false, message: '先に資料の「誰に・何を」を書いてください'};
    if (this.state.running) return {ok: false, message: '前の依頼を処理中です'};
    this.update({running: {kind: 'flow', pending: 1, startedAt: Date.now(), deep: false, status: '今の流れを読み解いています'}});
    try {
      const reading = await this.ensureDeckReading(presentationId, brief, await this.loadDeckPages(presentationId), true);
      return reading ? {ok: true, message: '読み解きました'} : {ok: false, message: '読み解けませんでした'};
    } catch (e) {
      return {ok: false, message: (e as Error).message};
    } finally {
      this.update({running: null});
    }
  }

  async submitDeckReading(input: DeckReadingInput): Promise<string[]> {
    const parsed = DeckReadingInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const request = this.deps.store.getRequest(input.requestId);
    if (!request || request.pageId !== DECK || request.approach !== DECK_READING) return ['不明な requestId です'];
    if (request.status !== 'pending') return ['この依頼はもう締め切られています'];
    const pageIds = request.snapshot.pageIds ?? [];
    const problems = validateDeckReading(parsed.data, {pageIds});
    if (problems.length) return problems;
    const reading = this.deps.store.addDeckReading(parsed.data, pageIds);
    if (this.state.location.presentationId === request.presentationId) {
      this.update({deckReading: {reading, stale: false}});
      void this.ensureThumbnails(request.presentationId, pageIds);
    }
    return [];
  }

  async submitPageReading(input: PageReadingInput): Promise<string[]> {
    const parsed = PageReadingInputSchema.safeParse(input);
    if (!parsed.success) return parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const request = this.deps.store.getRequest(input.requestId);
    if (!request || request.approach !== PAGE_READING) return ['不明な requestId です'];
    if (request.status !== 'pending') return ['この依頼はもう締め切られています'];
    const reading = this.deps.store.savePageReading(request.presentationId, request.pageId, pageKey(request.snapshot), parsed.data);
    const page = this.state.page;
    if (page && this.state.location.presentationId === request.presentationId && page.pageId === request.pageId) this.update({page: {...page, reading}});
    return [];
  }

  dispose() { this.runner?.dispose(); }
}
