// What the panel sees and what it may ask for. Secrets (cookies, tokens) never cross this boundary.
import type {SlideElement, Variant} from './element';
import type {ColorMeaning, Palette} from './palette';
import type {Storyline} from './storyline';
import type {DeckReading, PageReading} from './reading';

// Who the presentation is for (audience) can differ from who its content is about (subject).
export type BriefView = {audience: string; message: string; context?: string; subject?: string};
// x/y/w/h: where the asset sits on the original page, used to crop it out of the page image.
export type PageAssetView = {id: string; kind: string; description: string; contentUrl?: string; previewUrl?: string; svg?: string; source?: import('./asset-pool').AssetSource; x: number; y: number; w: number; h: number};
// Layout/master decorations (bands, rules) that remain on any page added from this one.
export type DecorationView = {x: number; y: number; w: number; h: number; kind: 'rect' | 'line'; color: string};

export type PanelState = {
  location: {presentationId: string | null; pageId: string | null};
  signedIn: boolean;
  browsers: Array<{id: string; label: string}>;
  google: {hasClient: boolean; connected: boolean; needsReconnect: boolean};
  deck: {presentationId: string; title: string; brief: BriefView | null; palette: Palette} | null;
  // textBoxes: where the original page's text sits, to hide it inside asset crops of the page image.
  page: {pageId: string; thumbnailUrl: string | null; decorations: DecorationView[]; assets: PageAssetView[]; textBoxes: Array<{x: number; y: number; w: number; h: number}>; reading: PageReading | null} | null;
  // How the current deck flows today; stale when pages were added, removed or reordered since.
  deckReading: {reading: DeckReading; stale: boolean} | null;
  pageError: string | null;
  variants: Variant[];
  assetPool: import('./asset-pool').AssetPoolState;
  library: import('./library').LibraryState;
  running: {kind: 'page' | 'flow'; pending: number; startedAt: number; deep: boolean; status: string | null} | null;
  storylines: Storyline[];
  // Rendered page images for storyboards (data URLs), keyed by page id.
  thumbnails: Record<string, string>;
  notices: string[];
  mcp: {url: string} | null;
};

// frames: the edited slides of the variant, in order (one array of elements per slide).
export type AdoptInput = {variantId: string; frames: SlideElement[][]; aim: string; counts: {moved: number; textChanged: number; resized: number}};

export type PanelApi = {
  loadLiveDraft(presentationId: string, pageId: string): Promise<{ok: boolean; draft?: import('./live-edit').LiveDraft | null; message?: string}>;
  saveLiveDraft(snapshotId: string, patches: import('./live-edit').ElementPatch[]): Promise<{ok: boolean; message?: string}>;
  refineLiveText(input: import('./text-refinement').RefineTextInput): Promise<import('./text-refinement').RefineTextResult>;
  cancelLiveRefinement(): Promise<void>;
  readLivePage(input: {presentationId: string; pageId: string; knownVersion?: string}): Promise<{ok: boolean; page?: import('./live-edit').LivePage | null; message?: string}>;
  applyLiveEdit(input: import('./live-edit').ApplyLiveEdit): Promise<import('./live-edit').ApplyLiveResult>;
  undoLiveEdit(id: string): Promise<import('./live-edit').ApplyLiveResult>;
  getState(): Promise<PanelState>;
  scanAssets(): Promise<{ok:boolean;message:string}>;
  selectAsset(id:string,selected:boolean): Promise<{ok:boolean;message:string}>;
  importLibraryFiles(): Promise<{ok: boolean; message: string}>;
  updateLibraryItem(key: string, patch: import('./library').LibraryPatch): Promise<{ok: boolean; message: string}>;
  removeLibraryItem(key: string): Promise<{ok: boolean; message: string}>;
  onState(listener: (state: PanelState) => void): () => void;
  importCookies(browserId: string): Promise<{ok: boolean; message: string}>;
  chooseGoogleClient(): Promise<{ok: boolean; message: string}>;
  connectGoogle(): Promise<{ok: boolean; message: string}>;
  saveBrief(input: BriefView & {colors: ColorMeaning[]}): Promise<{ok: boolean; message: string}>;
  requestVariants(input: {direction: string; deep: boolean}): Promise<{ok: boolean; message: string}>;
  requestStorylines(input: {direction: string; deep: boolean}): Promise<{ok: boolean; message: string}>;
  adoptStoryline(storylineId: string): Promise<{ok: boolean; message: string; newPresentationId?: string}>;
  openPresentation(presentationId: string): Promise<void>;
  refreshStoryboardImages(): Promise<void>;
  rereadDeck(): Promise<{ok: boolean; message: string}>;
  openExternal(url: string): Promise<void>;
  cancelRequests(): Promise<void>;
  adopt(input: AdoptInput): Promise<{ok: boolean; message: string; newPageId?: string}>;
  showPage(pageId: string): Promise<void>;
  dismissNotice(index: number): Promise<void>;
};
